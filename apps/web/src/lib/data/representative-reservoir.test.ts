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
