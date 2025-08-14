import { PDFDocument, PDFPage, PDFForm, rgb, StandardFonts } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import { CaseSummary, PdfFieldMap, PdfField, PdfTemplate } from '../../types/pdf';

export class PdfEngine {
  private fontCache: Map<string, Uint8Array> = new Map();

  async generatePdf(
    templateId: string,
    summary: CaseSummary,
    outputPath: string
  ): Promise<void> {
    const template = this.getTemplate(templateId);
    const fieldMap = this.loadFieldMap(template.fieldMapPath);
    
    // 템플릿 PDF 로드
    const templateBytes = fs.readFileSync(template.templatePath);
    const pdfDoc = await PDFDocument.load(templateBytes);
    
    // 폰트 로드
    const fontBytes = await this.loadFont(fieldMap.font);
    const customFont = await pdfDoc.embedFont(fontBytes);
    
    // 페이지 가져오기
    const page = pdfDoc.getPage(fieldMap.page);
    const form = pdfDoc.getForm();
    
    // 필드별로 매핑 처리
    for (const [path, field] of Object.entries(fieldMap.fields)) {
      const value = this.getValueByPath(summary, path);
      if (value !== undefined && value !== null) {
        await this.fillField(page, form, field, value, customFont);
      }
    }
    
    // AcroForm 평면화 (편집 불가능하게 만들기)
    try {
      form.flatten();
    } catch (e) {
      console.warn('Form flatten failed, continuing...', e);
    }
    
    // PDF 저장
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, pdfBytes);
  }

  private async fillField(
    page: PDFPage,
    form: PDFForm,
    field: PdfField,
    value: any,
    font: any
  ): Promise<void> {
    switch (field.type) {
      case 'text':
        await this.fillTextField(page, form, field, String(value), font);
        break;
      case 'checkbox':
        this.fillCheckboxField(page, field, Boolean(value));
        break;
      case 'checkbox-group':
        this.fillCheckboxGroupField(page, field, String(value));
        break;
      case 'date':
        await this.fillTextField(page, form, field, this.formatDate(value, field.format), font);
        break;
      case 'stamp':
        await this.fillStampField(page, field, font);
        break;
    }
  }

  private async fillTextField(
    page: PDFPage,
    form: PDFForm,
    field: PdfField,
    value: string,
    font: any
  ): Promise<void> {
    // AcroForm 필드가 있으면 우선 사용
    if (field.pdfField) {
      try {
        const textField = form.getTextField(field.pdfField);
        textField.setText(value);
        return;
      } catch (e) {
        console.warn(`AcroForm field ${field.pdfField} not found, using coordinates`);
      }
    }

    // 좌표 기반 텍스트 그리기
    if (field.x !== undefined && field.y !== undefined) {
      const fontSize = field.fontSize || 10;
      const lineHeight = field.lineHeight || fontSize + 2;
      const maxLines = field.maxLines || 1;
      const width = field.w || 200;

      // 포맷팅 적용
      const formattedValue = this.formatValue(value, field.format);
      
      // 줄바꿈 처리
      const lines = this.wrapText(formattedValue, width, fontSize);
      const displayLines = lines.slice(0, maxLines);
      
      // 마지막 줄이 잘렸으면 말줄임표 추가
      if (lines.length > maxLines) {
        displayLines[maxLines - 1] = displayLines[maxLines - 1] + '...';
      }

      // 각 줄 그리기
      for (let i = 0; i < displayLines.length; i++) {
        const yPos = field.y - (i * lineHeight);
        page.drawText(displayLines[i], {
          x: field.x,
          y: yPos,
          size: fontSize,
          font: font,
          color: rgb(0, 0, 0),
        });
      }
    }
  }

  private fillCheckboxField(page: PDFPage, field: PdfField, checked: boolean): void {
    if (!checked || field.x === undefined || field.y === undefined) return;

    const boxSize = field.box || 12;
    
    // 체크 표시 그리기
    page.drawRectangle({
      x: field.x,
      y: field.y,
      width: boxSize,
      height: boxSize,
      color: rgb(0, 0, 0),
    });
  }

  private fillCheckboxGroupField(page: PDFPage, field: PdfField, selectedValue: string): void {
    if (!field.options || !field.options[selectedValue]) return;

    const option = field.options[selectedValue];
    const boxSize = option.box || 12;

    page.drawRectangle({
      x: option.x,
      y: option.y,
      width: boxSize,
      height: boxSize,
      color: rgb(0, 0, 0),
    });
  }

  private async fillStampField(page: PDFPage, field: PdfField, font: any): Promise<void> {
    if (field.x === undefined || field.y === undefined) return;

    const text = field.text || '(서명)';
    const fontSize = field.fontSize || 10;
    const width = field.w || 90;
    const height = field.h || 36;

    // 테두리 그리기
    page.drawRectangle({
      x: field.x,
      y: field.y,
      width: width,
      height: height,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });

    // 텍스트 중앙 정렬
    page.drawText(text, {
      x: field.x + width / 2 - (text.length * fontSize) / 4,
      y: field.y + height / 2 - fontSize / 2,
      size: fontSize,
      font: font,
      color: rgb(0, 0, 0),
    });
  }

  private formatValue(value: string, format?: string): string {
    if (!format) return value;

    // 숫자 포맷팅
    if (format.includes('#,###')) {
      const num = parseFloat(value);
      if (!isNaN(num)) {
        return format.replace('#,###', num.toLocaleString('ko-KR'));
      }
    }

    return value;
  }

  private formatDate(value: any, format?: string): string {
    if (!format) return String(value);

    const date = new Date(value);
    if (isNaN(date.getTime())) return String(value);

    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    return format
      .replace('YYYY', year.toString())
      .replace('MM', month.toString().padStart(2, '0'))
      .replace('M', month.toString())
      .replace('DD', day.toString().padStart(2, '0'))
      .replace('D', day.toString());
  }

  private wrapText(text: string, maxWidth: number, fontSize: number): string[] {
    // 간단한 줄바꿈 로직 (실제로는 더 정교한 측정 필요)
    const approxCharWidth = fontSize * 0.6;
    const maxCharsPerLine = Math.floor(maxWidth / approxCharWidth);
    
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if ((currentLine + word).length <= maxCharsPerLine) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);

    return lines;
  }

  private getValueByPath(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private getTemplate(templateId: string): PdfTemplate {
    const templates: Record<string, PdfTemplate> = {
      'dereg_form': {
        id: 'dereg_form',
        name: '자동차 말소신청서',
        templatePath: path.join(__dirname, '../../templates/dereg_form/template.pdf'),
        fieldMapPath: path.join(__dirname, '../../templates/dereg_form/fieldMap.json'),
        kind: 'DEREG_FORM'
      },
      'invoice': {
        id: 'invoice',
        name: '인보이스',
        templatePath: path.join(__dirname, '../../templates/invoice/template.pdf'),
        fieldMapPath: path.join(__dirname, '../../templates/invoice/fieldMap.json'),
        kind: 'INVOICE'
      }
    };

    if (!templates[templateId]) {
      throw new Error(`Template not found: ${templateId}`);
    }

    return templates[templateId];
  }

  private loadFieldMap(fieldMapPath: string): PdfFieldMap {
    const content = fs.readFileSync(fieldMapPath, 'utf-8');
    return JSON.parse(content);
  }

  private async loadFont(fontName: string): Promise<Uint8Array> {
    if (this.fontCache.has(fontName)) {
      return this.fontCache.get(fontName)!;
    }

    const fontPath = path.join(__dirname, '../../fonts', fontName);
    
    if (!fs.existsSync(fontPath)) {
      // 기본 폰트 사용
      console.warn(`Font ${fontName} not found, using Helvetica`);
      return new Uint8Array(); // pdf-lib이 기본 폰트를 사용하도록
    }

    const fontBytes = fs.readFileSync(fontPath);
    const fontArray = new Uint8Array(fontBytes);
    this.fontCache.set(fontName, fontArray);
    return fontArray;
  }
}