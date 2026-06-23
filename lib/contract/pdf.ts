// 계약서 DOM → A4 PDF (클라이언트). html2canvas로 래스터 캡처 후 jsPDF에 페이지 단위로 분할.
//   - 한글이 이미지로 캡처되므로 jsPDF 한글 폰트 임베드 불필요.
//   - 서명 이미지는 base64 data URL로 주입(같은 출처) → 캔버스 taint 없음.
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

export async function downloadContractPdf(el: HTMLElement, filename: string) {
  const canvas = await html2canvas(el, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
  });
  const imgData = canvas.toDataURL('image/png');

  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgW = pageW;
  const imgH = (canvas.height * imgW) / canvas.width;

  let heightLeft = imgH;
  let position = 0;
  pdf.addImage(imgData, 'PNG', 0, position, imgW, imgH);
  heightLeft -= pageH;
  while (heightLeft > 0) {
    position -= pageH;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, position, imgW, imgH);
    heightLeft -= pageH;
  }
  pdf.save(filename);
}
