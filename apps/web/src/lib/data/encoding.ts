// KRC 파일데이터 인코딩 처리. 새 인코딩 라이브러리를 추가하지 않고
// Node 내장 TextDecoder만 사용한다(WHATWG euc-kr = CP949 호환).
import { TextDecoder } from "node:util";

const cp949Decoder = new TextDecoder("euc-kr");
const utf8Decoder = new TextDecoder("utf-8");

export function decodeCp949(bytes: Uint8Array): string {
  return cp949Decoder.decode(bytes);
}

export function decodeUtf8(bytes: Uint8Array): string {
  // WHATWG TextDecoder는 기본값(ignoreBOM: false)에서 UTF-8 BOM을 제거한다.
  return utf8Decoder.decode(bytes);
}
