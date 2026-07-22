import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  STAGE_LABEL_BY_CODE,
  type DroughtStageCode,
} from "../../lib/data/drought-stage";
import { StageChip } from "./StageChip";

const STAGE_CODES = Object.keys(STAGE_LABEL_BY_CODE) as DroughtStageCode[];

describe("StageChip", () => {
  it.each(STAGE_CODES)(
    "%s 코드에 공인 라벨과 보조 라벨을 함께 표시한다",
    (code) => {
      const { unmount } = render(<StageChip code={code} />);

      expect(screen.getByText(STAGE_LABEL_BY_CODE[code])).toBeInTheDocument();
      expect(screen.getByText("지역 평년 대비 기준")).toBeInTheDocument();

      unmount();
    },
  );

  it("5단계 라벨이 drought-stage 단일 출처와 일치한다", () => {
    expect(STAGE_CODES).toHaveLength(5);

    for (const code of STAGE_CODES) {
      const { unmount } = render(<StageChip code={code} />);
      expect(screen.getByText(STAGE_LABEL_BY_CODE[code])).toBeInTheDocument();
      unmount();
    }
  });
});
