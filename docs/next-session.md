# 다음 세션 재개 가이드

> 마지막 세션 종료: **2026-05-12**
> 작성 목적: 사용자가 'start' 입력 시 Claude가 이 파일을 읽고 즉시 현재 상태와 다음 액션을 보고할 수 있도록.

---

## 1. 현재 워킹 트리 (미커밋)

```
staged:
  renamed: Code.gs → appscript/Code.gs

unstaged:
  modified: appscript/Code.gs       (versions 임베드, 날짜 포매팅)
  modified: admin.html              (+253/-? lines: 자동갱신, diff 모달, 옵션 B 등)
  modified: CLAUDE.md               (경로 4곳 갱신)
  modified: docs/code-analysis.md   (경로 15곳 갱신)
  modified: docs/issues.md          (문제 6, 7 + 기능개선 F1~F5 + 경로 갱신)

총 변경량: 553 insertions(+), 37 deletions(-)
```

⚠️ **푸시 금지**: 라이브 검증이 끝나지 않았음. 검증 통과 후 커밋/푸시.

## 2. 배포 상태

| 컴포넌트 | 상태 |
|---|---|
| GAS (`appscript/Code.gs::listRequests`) | ✅ 새 버전 배포 완료 (URL 변경 없음) |
| GitHub Pages (admin.html) | ❌ 미푸시 — 라이브엔 옛 버전 |
| 로컬 admin.html | ✅ 모든 수정 반영 — `file://`로 열면 새 동작 |

GAS URL (참고): `appscript/Code.gs`의 새 버전이 적용된 배포 URL은 `config.js`의 `JHTECH_GAS_URL`과 동일.
시크릿 모드로 `?action=list` 호출 시 응답에 `versions` 배열 + `yyyy-MM-dd HH:mm` 날짜 포맷이 정상 확인됨 (검증 완료).

## 3. 다음 세션 1순위 — 라이브(또는 로컬) 검증

사용자가 직접 admin.html을 열고 확인해야 할 시나리오 **10개**:

```bash
open /Users/seonjecho/Projects/jhtechsmart/admin.html
# 강력 새로고침: Cmd+Shift+R
```

| # | 시나리오 | 기대 결과 |
|---|---|---|
| 1 | 로그인 직후 | 목록 자동 로드 (수동 새로고침 불필요) |
| 2 | 헤더 우측 | "방금 갱신" → "X초 전 갱신" 표시 |
| 3 | 견적완료 신청 클릭 | 우측 패널 + 버전 이력 표가 **동시에** 표시 (지연 없음) |
| 4 | 동일 신청에서 "수정" / "수정 모드" 진입 | 버전 이력 유지됨 |
| 5 | 탭 활성 상태 60초 대기 | 자동 갱신, 깜빡임 없음 |
| 6 | 다른 탭 갔다가 5초+ 후 복귀 | 자동 갱신 |
| 7 | 시트에 신청 추가 | 60초 내 좌측 목록에 자동 표시 |
| 8 | R02 행 "변경 정보" 클릭 | 모달 표시: R00 → R02 변경 항목 정확 |
| 9 | R00 행 | "최초" 라벨 (버튼 비활성) |
| 10 | 시트에서 신청 삭제 → 폴링 대기 | 좌측 + 우측 동시 리셋 (문제 7) |

## 4. 검증 통과 후 커밋 전략

권장 — 3개 논리적 커밋:

| # | 메시지 | 포함 파일 |
|---|---|---|
| 1 | `feat: 견적 버전 즉시 표시 (listRequests에 versions 임베드)` | `appscript/Code.gs`, `admin.html` (selectReq 부분) |
| 2 | `feat: 자동 갱신 + 변경 정보 모달 + 삭제 동기화` | `admin.html` (폴링/visibility/diff/문제7 부분) |
| 3 | `chore: Code.gs를 appscript/로 이동 + 문서 경로 갱신` | 파일 이동 + `CLAUDE.md`, `docs/code-analysis.md`, `docs/issues.md` |

또는 단일 커밋으로 묶어도 무방 (사용자 선호 확인 필요).

## 5. 남은 원래 문제 (우선순위 순)

`docs/issues.md`에서 ⛔ 미착수 상태:

| # | 문제 | 우선순위 | 비고 |
|---|---|---|---|
| 4 | 백엔드 권한 검증 부재 (개인정보·계정 평문 노출) | 🔴 이번 주 | 단계별 가능 — 비밀번호 마스킹(5분) → 토큰 도입(반나절) |
| 2 | PDF 저장 경로/파일명 회귀 (작업내역 vs 실제 코드) | 🟡 정책 결정 후 | 이력 보존 vs 최신만 정책 결정 필요 |
| 3 | 신청 제출 silent failure | 🟡 2주 내 | fetch + 응답 확인으로 전환 |
| 5 | 견적 버전 이력 이중 저장소 (localStorage dead code) | 🟢 여유 시 | F1 작업으로 `loadVersionsForReq()`도 dead code 추가됨 |

**다음 작업 추천**: 문제 4 (보안). 가장 효과가 큰 단일 액션은 `getUserConfig`의 비밀번호 마스킹(5분).

## 6. 결정 대기 / 보류 사항

- **편집 중 보호 토스트**: currentReq 편집 중 다른 관리자가 삭제하면 경고? (문제 7 한계)
- **stale 필드 자동 동기화**: 폴링 시 currentReq.id가 살아있지만 다른 필드(status/assignee 등) 변경된 경우 우측 패널 자동 갱신? (현재는 versions만 동기화)
- **단일 진실 소스 단점 보완**: `config.js` 캐시 무효화를 위한 버전 쿼리스트링 도입 여부

## 7. 작업 규칙 (자동 적용 — 메모리에 저장됨)

> 메모리: `feedback_workflow_rules_jhtechsmart.md` (이미 등록)

1. GAS 코드는 `appscript/` 폴더에 저장
2. GAS 적용 시 복사 명령(`pbcopy < appscript/Code.gs`) + 붙여넣을 위치 안내
3. 배포 절차 설명 ("배포 관리 → 기존 배포 편집 → 새 버전")
4. `docs/issues.md` 갱신하고 업데이트 내용만 보고
5. 위 1~4 외 사항은 사용자에게 사전 확인
