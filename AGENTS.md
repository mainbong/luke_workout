# Luke Workout Repository Rules

이 파일은 `mainbong/luke_workout`에서 Codex와 다른 작업 agent가 따라야 할
루트 canonical 운영 규칙이다. 최신 사용자 지시가 이 파일과 충돌하면 최신
지시를 따르되, 범위를 임의로 넓히지 않는다.

## Task, Issue, Session Flow

- Notion [`루크운동기록 이슈 보드`](https://app.notion.com/p/1d1c61002fa6481a902ecb1564481332)가
  canonical product Task 보드다.
  Task는 사용자 결과, 상태, 우선순위, blocker, 관련 Issue/PR, 검증, merge 및
  배포 증거를 소유한다.
- 저장소를 변경하기 전에 보드와 GitHub를 확인해 같은 Task, Issue 또는 PR을
  중복 생성하지 않는다. 기존 Task가 있으면 그 상태와 근거를 최신으로 유지한다.
- GitHub Issue는 이 저장소에서 한 PR로 끝낼 수 있는 bounded 실행 단위다.
  각 Issue에는 parent Notion Task, 배경, scope/non-scope, 의존성, 완료 조건과
  검증 방법을 기록한다.
- Issue마다 별도 Codex task/session과 별도 worktree를 사용한다. 다른 Issue의
  세션이나 worktree를 이어 쓰거나 함께 수정하지 않는다.
- 현재 coordinator task/session은
  `019f922e-541a-7a83-84a8-cba7d38b3fe2`다. 구현 세션은 coordinator의 조정
  역할을 대신하거나 사용자 결정 창구를 새로 만들지 않는다.

```text
Notion Task → GitHub Issue → 전용 session/worktree → 로컬 검증
→ focused PR → coordinator 검토/merge → 브라우저·Pages 증거 → Task 완료
```

## Repository And Session Ownership

- 작업/세션 이름과 최신 사용자 지시로 선언된 repository 및 Issue scope를 쓰기
  권한 경계로 취급한다. 연관 기능, 과거 대화 또는 편의를 이유로 범위를 넓히지
  않는다.
- 현재 세션은 지정된 Issue와 이 repository만 수정한다. 범위 밖 repository,
  다른 Issue, primary checkout과 다른 worktree는 읽기 전용이다.
- subagent도 부모 세션과 같은 경계를 상속한다. 위임으로 경계를 우회하지 않는다.
- 최초 변경 전에 `git status`, 현재 branch/HEAD와 최근 commit을 확인한다.
  기존 commit, 사용자의 uncommitted WIP와 다른 세션 산출물은 그대로 보존한다.
- 승인 없이 기존 변경을 삭제, 되돌리기, 재작성, squash, rebase하거나 다른
  worktree의 branch를 전환하지 않는다. 충돌이나 범위 침범을 발견하면 즉시
  멈추고 현재 상태를 보존한다.
- branch, commit과 PR은 한 Issue의 scope에 집중한다. 구현 세션은 검증된 PR까지
  소유하고 merge는 coordinator의 검토와 판단에 맡긴다.

## Blockers And Coordinator Routing

- 사용자 선택, 입력, 승인 또는 범위 조정이 필요하면 임의로 추정하거나 현재
  구현 세션에서 사용자에게 직접 묻지 않는다.
- blocker가 생기면 작업 상태를 보존하고 parent Notion Task 상태를 `대기`로
  바꾼 뒤 coordinator에 다음을 전달한다.
  - Task, repository, Issue와 현재 branch/commit
  - 필요한 결정 또는 입력 한 가지
  - 재현 근거와 이미 수행한 검증
  - 안전한 선택지, trade-off와 권장안
  - blocker와 무관하게 계속할 수 있는 작업
- focused PR을 열었지만 coordinator 검토/merge가 남은 경우도 Task를 `대기`로
  두고 PR URL, 검증 증거와 남은 확인 사항을 coordinator에 전달한다.
- coordinator가 답을 돌려주기 전에는 blocked 경로를 추가 변경하지 않는다.
  coordinator가 바뀌면 최신 사용자 지시로 지정된 세션을 따른다.

## Validation And Evidence

- 변경 종류에 맞는 최소 검증을 실행하고 PR과 Notion Task에 정확한 명령,
  결과와 대상 commit을 기록한다. 실행하지 않은 검증을 PASS로 적지 않는다.
- 모든 변경에서 최종 `git status`, scoped diff와 `git diff --check`를 확인한다.
  TypeScript 또는 빌드에 영향을 주면 관련 로컬 script(예: `npm run typecheck`,
  `npm run build`)도 실행한다.
- UI 변경은 로컬 브라우저에서 실제 route, viewport, 조작 순서, 기대/관찰 결과와
  필요한 screenshot을 기록한다. 눈에 보이는 결함은 자동 검증 PASS보다 우선한다.
- GitHub Pages에 영향을 주는 변경은 merge 후 `main`의 정확한 commit SHA,
  Pages workflow 결과, 배포 URL과 배포된 페이지 smoke 확인을 기록한다. PR이나
  로컬 build만으로 Pages 배포 성공을 주장하지 않는다.
- 로컬 검증, 브라우저 QA와 Pages 배포는 서로 다른 증거다. 해당하지 않으면
  이유를 `N/A`로 기록하고, 필요하지만 아직 수행하지 못했으면 `대기` 또는
  `blocked`로 기록한다.
- coordinator는 PR의 현재 head, 검증 증거와 scope를 확인한 뒤 merge한다.
  Task는 필요한 merge 및 배포/QA 증거가 모두 기록된 후에만 `완료`로 바꾼다.

## Repeated Failure Circuit Breaker

- 같은 접근과 합격 기준에서 자동 gate 또는 직접 visual QA가 3회 연속 실패하면
  추가 수정과 재실행을 멈춘다. 이름 변경, 수치 미세 조정과 재렌더만으로 실패
  횟수를 초기화하지 않는다.
- 3회째에는 현재 산출물을 보존하고 root cause, 접근법의 성립 가능성, 대안과
  다음 한 번의 실험에 대한 합격/중단 기준을 재판정해 coordinator에 보고한다.
- 5회 연속 실패하면 hard stop이다. 명시적 승인 없이 같은 접근을 반복하지 말고
  구조적으로 다른 방법으로 전환하거나 Task를 `대기`로 두고 blocked로 보고한다.
- 실제 브라우저 결함을 자동 gate가 놓쳤다면 그 PASS를 취소하고 실패로 센다.
  결함을 잡도록 gate를 고치기 전에는 downstream merge 또는 배포로 진행하지 않는다.

## Secrets And Health Information

- token, password, private key, session, magic link와 secret/service-role key 같은
  비밀값을 chat, 명령 출력, log, screenshot, 파일, commit, Issue 또는 PR에 노출하지
  않는다. credential 이름, Secret 참조와 환경 식별자만 전달한다.
- 비밀값을 출력해 확인하지 않는다. 로컬 환경 파일과 GitHub variable/secret은
  값이 아니라 존재 여부 및 비밀이 아닌 metadata만 검증한다.
- 운동 기록, 신체 측정값, 건강 메모, 통증/증상, 사진·영상, 이메일 및 사용자
  식별자는 민감한 건강·개인정보로 취급한다.
- fixture, test, log, Issue, PR, screenshot, Pages와 commit에는 실제 사용자 정보를
  넣지 않는다. 검증에는 필요한 최소한의 합성·익명화 데이터를 사용한다.
- 실제 데이터가 필요한 진단은 먼저 범위와 보존 방식을 coordinator에서 승인받고,
  최소 범위로 일시 처리한 뒤 공유 전 식별 정보를 제거한다.
