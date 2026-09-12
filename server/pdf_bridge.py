import sys, json, base64, io, os
from xml.sax.saxutils import escape

def extract_pdf(data):
    from pypdf import PdfReader
    reader=PdfReader(io.BytesIO(base64.b64decode(data['base64'])))
    if reader.is_encrypted:
        raise ValueError('暂不支持加密PDF，请提供已解锁的副本或粘贴文字。')
    if len(reader.pages)>20:
        raise ValueError('演示版仅支持20页以内的PDF。')
    text='\n'.join((p.extract_text() or '') for p in reader.pages)
    if len(text)>50000:
        raise ValueError('文档文字过多，请提供本次就诊相关页。')
    return {'text':text,'pages':len(reader.pages),'needsTranscription':not text.strip()}

def make_pdf(p):
    from reportlab.pdfgen import canvas
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_LEFT
    from reportlab.lib import colors
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.lib.pagesizes import A4
    candidates=[os.environ.get('PDF_CJK_FONT',''),'/System/Library/Fonts/STHeiti Light.ttc','/System/Library/Fonts/Supplemental/Arial Unicode.ttf','/usr/share/fonts/truetype/wqy/wqy-microhei.ttc']
    loaded=False
    for path in candidates:
        if not path or not os.path.exists(path):continue
        try:pdfmetrics.registerFont(TTFont('YibanCJK',path,subfontIndex=0));loaded=True;break
        except Exception:continue
    if not loaded:raise ValueError('缺少可嵌入的中文字体，请设置PDF_CJK_FONT。')
    font='YibanCJK'; width,height=A4; out=io.BytesIO()
    styles=getSampleStyleSheet()
    base=ParagraphStyle('Chinese',fontName=font,fontSize=10,leading=16,textColor=colors.HexColor('#354A3E'),wordWrap='CJK',spaceAfter=7)
    small=ParagraphStyle('SmallChinese',parent=base,fontSize=8,leading=12,textColor=colors.HexColor('#71816B'))
    cell=ParagraphStyle('TableChinese',parent=base,fontSize=9,leading=14,textColor=colors.HexColor('#5B7055'))
    title=ParagraphStyle('TitleChinese',parent=base,fontSize=25,leading=33,spaceAfter=10,textColor=colors.HexColor('#284D3B'))
    h2=ParagraphStyle('H2Chinese',parent=base,fontSize=14,leading=22,spaceBefore=14,spaceAfter=8,textColor=colors.HexColor('#345D43'))
    def para(text,style=base):return Paragraph(escape(str(text)).replace('\n','<br/>'),style)
    def table(rows,widths,header=True):
        t=Table([[para(c,cell) for c in row] for row in rows],colWidths=widths,hAlign='LEFT',repeatRows=1 if header else 0)
        t.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('BACKGROUND',(0,0),(-1,0),colors.HexColor('#EAF0E2')),('LINEBELOW',(0,0),(-1,0),.6,colors.HexColor('#CCD9BF')),('LINEBELOW',(0,1),(-1,-1),.3,colors.HexColor('#E0E7D7')),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8)]))
        return t
    story=[para('有伴 | 就医沟通摘要',title),para(f"{p['person']['name']} · {p['person']['age']}岁    {p['start']} 至 {p['end']}",base),para('演示就医包：监测数据包含模拟样本，不能作为真实病情结论。',small)]
    emergency=p['emergency']
    story.append(table([['已核对的基本信息','当前记录'],['诊断/档案', '；'.join(emergency.get('diagnoses') or ['尚未填写'])],['过敏史','；'.join(emergency.get('allergies') or ['未知，不能视为无过敏'])],['主要陪护人',p.get('caregiver','尚未填写')]], [105,406]))
    story.append(para('本期需要关注',h2))
    facts=p.get('facts') or [{'text':'暂无满足演示统计阈值的异常；缺失记录不代表正常。'}]
    for fact in facts[:4]:story.append(para('• '+fact['text']))
    story.append(para('关键指标与个人历史比较',h2))
    rows=[['指标','本期 / 较上期','样本与来源']]
    for m in p['metrics'][:6]:
        val='未知' if m['value'] is None else str(m['value'])+m['unit']
        delta='上期不足' if m['delta'] is None else ('+' if m['delta']>0 else '')+str(m['delta'])+m.get('deltaUnit',m['unit'])
        rows.append([m['name'],val+' / '+delta,f"本期n={m['currentN']}，基线n={m['baselineN']}；模拟"])
    story.append(table(rows,[133,173,205]))
    score=p['score'];story.append(para(f"照护闭环指数：{score['value'] if score['value'] is not None else '样本不足'}；{score['done']}/{score['total']}项已处理或确认。该值只反映执行记录，不是健康或认知评分。",small))
    story.append(PageBreak())
    story.append(para('用药、照护进展与就诊问题',title))
    story.append(para('用药清单与执行记录',h2))
    meds=emergency.get('medications') or []
    if meds:
        rows=[['药物（原文/家属核对）','剂量与时间（非建议）']]
        for med in meds[:8]:rows.append([med.get('name','待核实'),str(med.get('dose') or '剂量未填写')+'；'+', '.join(med.get('times') or [])])
        story.append(table(rows,[220,291]))
        if len(meds)>8:story.append(para('这里只列前8项，请另附完整用药清单。',small))
    else:story.append(para('尚无已核对用药清单，请陪护人补充；不能据此判断未用药。'))
    med=p['daily']['stats']['medication'];story.append(para(f"本期已报告服用{med['taken']}次，家属确认漏服{med['missed']}次，尚不明确{med['unclear']}次。未记录时段不计入依从率。"))
    story.append(para('近期危险事件与处理',h2))
    if p['events']:
        for e in p['events'][:5]:story.append(para(f"• {e['date']} {e['title']}｜{e['status']}｜{e.get('result') or '仍需跟进'}"))
        if len(p['events'])>5:story.append(para(f"本期共{len(p['events'])}起事件，此处展示最近5起。",small))
    else:story.append(para('本期没有事件记录；不等同于期间没有异常。'))
    story.append(para('建议陪护人向医生核对',h2))
    for i,s in enumerate(p['suggestions'][:3],1):story.append(para(f"{i}. {s['title']}：{s['text']}"))
    if p.get('familyNotes'):
        story.append(para('家属补充（节选）',h2))
        for n in p['familyNotes'][:2]:story.append(para('• '+n,small))
    if p.get('labNotes'):
        story.append(para('已核对的指标原文（节选）',h2))
        for n in p['labNotes'][:2]:story.append(para('• '+n,small))
    story.append(para('资料来源与尚待核实',h2))
    for i,s in enumerate(p['sources'],1):story.append(para(f"[{i}] {s['source']}：{s['title']}\n{s['url']}",small))
    story.append(para('个人资料：家属配置、手动记录和已核对病历；监测图表：虚构设备样本；资料检索：关键词与结构化匹配，未声称向量RAG。突然明显变化需立即寻求医疗帮助，不等待周期报告。',small))
    def decorate(c,doc):
        c.setFillColor(colors.HexColor('#355F47'));c.rect(0,height-10,width,10,fill=1,stroke=0)
        c.setStrokeColor(colors.HexColor('#DDE7D3'));c.line(42,38,width-42,38)
        c.setFont(font,8);c.setFillColor(colors.HexColor('#7A8B70'));c.drawString(42,25,'有伴 · 来源可核查的照护记录 / 演示资料');c.drawRightString(width-42,25,f'{doc.page}')
    doc=SimpleDocTemplate(out,pagesize=A4,rightMargin=42,leftMargin=42,topMargin=38,bottomMargin=50,title='有伴就医沟通摘要',author='有伴 Demo')
    doc.build(story,onFirstPage=decorate,onLaterPages=decorate)
    return {'base64':base64.b64encode(out.getvalue()).decode()}

if __name__=='__main__':
    try:
        obj=json.load(sys.stdin);result=extract_pdf(obj) if obj.get('operation')=='extract' else make_pdf(obj['payload']);json.dump(result,sys.stdout,ensure_ascii=False)
    except Exception as e:
        json.dump({'error':str(e)[:300]},sys.stdout,ensure_ascii=False);sys.exit(1)
