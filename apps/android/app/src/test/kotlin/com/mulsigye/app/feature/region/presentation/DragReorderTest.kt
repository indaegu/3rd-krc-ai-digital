package com.mulsigye.app.feature.region.presentation

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * 드래그 재정렬의 목표 인덱스 계산([dragTargetIndex]) 순수 함수 검증.
 *
 * 실제 제스처(터치 이벤트)는 단위 테스트가 어려우므로, 순서를 결정하는 계산만 떼어 검증한다.
 * 한 칸 높이 100px, 절반(50px)을 넘겨야 한 칸 이동한다는 규칙을 확인한다.
 */
class DragReorderTest {

    @Test
    fun stayAtSameIndexBelowHalfThreshold() {
        // 절반(50px) 미만이면 제자리.
        assertEquals(1, dragTargetIndex(fromIndex = 1, accumulatedDy = 40f, itemHeightPx = 100f, count = 4))
        assertEquals(1, dragTargetIndex(fromIndex = 1, accumulatedDy = -40f, itemHeightPx = 100f, count = 4))
    }

    @Test
    fun movesDownOneWhenPastHalf() {
        assertEquals(2, dragTargetIndex(fromIndex = 1, accumulatedDy = 60f, itemHeightPx = 100f, count = 4))
    }

    @Test
    fun movesUpOneWhenPastHalf() {
        assertEquals(0, dragTargetIndex(fromIndex = 1, accumulatedDy = -60f, itemHeightPx = 100f, count = 4))
    }

    @Test
    fun movesMultipleSteps() {
        assertEquals(3, dragTargetIndex(fromIndex = 0, accumulatedDy = 250f, itemHeightPx = 100f, count = 4))
    }

    @Test
    fun clampsToListBounds() {
        // 위/아래 끝을 넘어서도 범위를 벗어나지 않는다.
        assertEquals(3, dragTargetIndex(fromIndex = 0, accumulatedDy = 9999f, itemHeightPx = 100f, count = 4))
        assertEquals(0, dragTargetIndex(fromIndex = 3, accumulatedDy = -9999f, itemHeightPx = 100f, count = 4))
    }

    @Test
    fun degenerateInputsKeepFromIndex() {
        // 높이 0(측정 전)이면 이동하지 않는다.
        assertEquals(2, dragTargetIndex(fromIndex = 2, accumulatedDy = 500f, itemHeightPx = 0f, count = 4))
        // 빈 목록이면 0.
        assertEquals(0, dragTargetIndex(fromIndex = 0, accumulatedDy = 100f, itemHeightPx = 100f, count = 0))
    }
}
