import { describe, expect, it } from "vitest";
import type { ReservoirSpec } from "./normalize-reservoir-spec";
import { pickRepresentativeReservoir } from "./representative-reservoir";

const spec = (
  facCode: string,
  beneficiaryArea: number | null,
  name = `시설${facCode}`,
): ReservoirSpec => ({
  facCode,
  name,
  address: null,
  sigunCode: facCode.slice(0, 5),
  beneficiaryArea,
  effectiveStorage: null,
});

describe("pickRepresentativeReservoir", () => {
  it("논산 44230: 탑정(5713)이 가곡(207.7)을 이긴다 — 실측 케이스", () => {
    const picked = pickRepresentativeReservoir("44230", [
      spec("4423010001", 207.7, "가곡"),
      spec("4423010045", 5713, "탑정"),
    ]);
    expect(picked?.facCode).toBe("4423010045");
    expect(picked?.name).toBe("탑정");
  });

  it("같은 시군구 코드의 시설만 후보로 둔다", () => {
    const picked = pickRepresentativeReservoir("44230", [
      spec("4617010001", 99999),
      spec("4423010045", 10),
    ]);
    expect(picked?.facCode).toBe("4423010045");
  });

  it("수혜면적이 같으면 facCode 오름차순 첫 시설을 뽑는다", () => {
    const picked = pickRepresentativeReservoir("44230", [
      spec("4423010045", 100),
      spec("4423010001", 100),
    ]);
    expect(picked?.facCode).toBe("4423010001");
  });

  it("수혜면적 null은 숫자보다 뒤로 밀린다", () => {
    const picked = pickRepresentativeReservoir("44230", [
      spec("4423010001", null),
      spec("4423010045", 1),
    ]);
    expect(picked?.facCode).toBe("4423010045");
  });

  it("전부 null이면 facCode 오름차순 첫 시설을 뽑는다", () => {
    const picked = pickRepresentativeReservoir("44230", [
      spec("4423010045", null),
      spec("4423010001", null),
    ]);
    expect(picked?.facCode).toBe("4423010001");
  });

  it("후보가 없으면 null을 돌려준다", () => {
    expect(
      pickRepresentativeReservoir("99999", [spec("4423010045", 1)]),
    ).toBeNull();
    expect(pickRepresentativeReservoir("44230", [])).toBeNull();
  });

  it("입력 배열을 변경하지 않고 순서와 무관하게 결정적이다", () => {
    const a = [
      spec("4423010045", 5713),
      spec("4423010001", 207.7),
      spec("4423010099", null),
    ];
    const b = [a[1]!, a[2]!, a[0]!];
    const snapshot = [...a];
    expect(pickRepresentativeReservoir("44230", a)?.facCode).toBe("4423010045");
    expect(pickRepresentativeReservoir("44230", b)?.facCode).toBe("4423010045");
    expect(a).toEqual(snapshot);
  });
});

// 넓은 시군에서 늘 같은 저수지가 뽑히던 문제 — 실측: 제주시(50110) 저수지 5곳 중
// 수혜면적 최대인 상대(670, 한림읍)가 조천읍·구좌읍 주소에도 대표지로 나왔다.
// 시설제원에 좌표가 없어 거리는 계산하지 않고, 도로명주소가 준 읍·면·동/리로만 좁힌다.
describe("pickRepresentativeReservoir — 읍·면·동/리로 좁히기", () => {
  /** 실측 스냅샷과 같은 제주시 5곳(소재지·수혜면적 그대로). */
  const JEJU: ReservoirSpec[] = [
    located("5011010004", "상대", "제주특별자치도 제주시 한림읍 상대리", 670),
    located("5011010005", "지향", "제주특별자치도 제주시 한림읍 상대리", 488),
    located("5011010006", "동명", "제주특별자치도 제주시 한림읍 동명리", 0),
    located("5011010007", "함덕", "제주특별자치도 제주시 조천읍 함덕리", 0),
    located("5011010008", "송당", "제주특별자치도 제주시 구좌읍 송당리", 494),
  ];

  it("읍·면·동이 없으면 종전처럼 시군에서 수혜면적 최대를 고른다", () => {
    expect(pickRepresentativeReservoir("50110", JEJU)?.name).toBe("상대");
  });

  it("조천읍 함덕리 주소는 함덕을 고른다(수혜면적 0이어도 가까운 쪽)", () => {
    const picked = pickRepresentativeReservoir("50110", JEJU, {
      emdNm: "조천읍",
      liNm: "함덕리",
    });
    expect(picked?.name).toBe("함덕");
  });

  it("구좌읍 송당리 주소는 송당을 고른다", () => {
    expect(
      pickRepresentativeReservoir("50110", JEJU, {
        emdNm: "구좌읍",
        liNm: "송당리",
      })?.name,
    ).toBe("송당");
  });

  it("같은 리에 둘이면 그 안에서 수혜면적 최대를 고른다(상대 670 > 지향 488)", () => {
    expect(
      pickRepresentativeReservoir("50110", JEJU, {
        emdNm: "한림읍",
        liNm: "상대리",
      })?.name,
    ).toBe("상대");
  });

  it("리에 후보가 없으면 읍·면·동으로 한 단계 넓힌다", () => {
    // 한림읍 명월리에는 저수지가 없다 → 한림읍 전체에서 최대(상대).
    expect(
      pickRepresentativeReservoir("50110", JEJU, {
        emdNm: "한림읍",
        liNm: "명월리",
      })?.name,
    ).toBe("상대");
  });

  it("읍·면·동에도 후보가 없으면 시군으로 넓힌다(인접 시군으로 넘어가지 않는다)", () => {
    // 애월읍 저수지는 구 코드(49710)라 50110 후보에 없다 → 시군 단위 폴백.
    expect(
      pickRepresentativeReservoir("50110", JEJU, {
        emdNm: "애월읍",
        liNm: "광령리",
      })?.name,
    ).toBe("상대");
  });

  it("소재지가 없는 후보(Supabase 구 페이로드)는 좁히기에서 자연히 빠진다", () => {
    const noAddress = [spec("5011010009", 999)];
    expect(
      pickRepresentativeReservoir("50110", [...JEJU, ...noAddress], {
        emdNm: "조천읍",
        liNm: "함덕리",
      })?.name,
    ).toBe("함덕");
  });

  it("이름이 겹쳐도 토큰으로만 맞춘다(동명동이 동명리에 걸리지 않는다)", () => {
    expect(
      pickRepresentativeReservoir("50110", JEJU, { emdNm: "동명동" })?.name,
      // "동명동"은 어느 소재지 토큰과도 같지 않아 시군 폴백이어야 한다.
    ).toBe("상대");
  });

  it("다른 시군 후보는 어떤 단계에서도 섞이지 않는다", () => {
    const other = located(
      "4423010045",
      "탑정",
      "충청남도 논산시 가야곡면 종연리",
      5713,
    );
    expect(
      pickRepresentativeReservoir("50110", [...JEJU, other], {
        emdNm: "조천읍",
        liNm: "함덕리",
      })?.name,
    ).toBe("함덕");
  });
});

/** 소재지를 가진 후보(좁히기 검증용). */
function located(
  facCode: string,
  name: string,
  address: string,
  beneficiaryArea: number | null,
): ReservoirSpec {
  return {
    facCode,
    name,
    address,
    sigunCode: facCode.slice(0, 5),
    beneficiaryArea,
    effectiveStorage: null,
  };
}
