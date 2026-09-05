# CUE 디자인 목업

사용자가 선택할 수 있도록 만든 세 가지 인터랙티브 HTML 목업입니다. 실제 앱 실행, 창 이동, 브라우저 탭 제어, 운영체제 단축키 등록은 수행하지 않습니다.

- A Focus: Raycast의 정교한 다크 목록과 키캡을 참고한 세 열 구성
- B Paper: Things의 밝은 표면과 여백을 참고한 두 열 구성, 하단 상세 설정
- C Studio: Stream Deck의 버튼 배열을 참고한 격자 구성

## 열기

프로젝트 루트에서:

```sh
python3 -m http.server 4317 --bind 127.0.0.1 --directory design/mockups
```

브라우저: http://127.0.0.1:4317

또는 `index.html`을 브라우저에서 직접 열 수 있습니다. 외부 폰트나 패키지 설치 없이 동작합니다.

## 확인할 동작

- 상단 A/B/C로 디자인 전환
- 설정 목록에서 항목 선택 → 이름·단축키·탭 표시 방식 변경
- 발표자 패널 버튼 클릭 → 표시/최소화 상태 미리보기
- 패널 헤더 드래그, 닫기, 다시 열기
- 설정에서 싱글/듀얼 모니터 환경 및 대기 모드 미리보기
- 듀얼 모니터 대기 모드에서 대상 선택 → 송출
- 예시 화면 등록, 프리셋 이름 변경, 검색
- 디자인 선택 버튼으로 선택 내용 확인

패널 드래그는 브라우저 안에서의 시연입니다. 프리셋·환경 설정은 현재 목업 세션에만 적용됩니다. 세 가지 디자인의 비교가 목적이므로 프리셋을 전환해도 같은 자료 여섯 개를 보여줍니다. 브라우저 페이지에 포커스가 있으면 기본 Option+1~6으로도 미리보기할 수 있습니다.

## 자료

- `../../DESIGN.md`: 디자인 방향과 공통 요소
- `evidence/*-preview.png`: 설정 화면 + 발표자 패널 이미지
- `evidence/*-desktop.png`: 전체 비교 페이지
- `evidence/qa-results.json`: 실제 Chrome에서 실행한 시나리오

공식 레퍼런스: [Raycast](https://www.raycast.com/press), [Things](https://culturedcode.com/things/features/), [Stream Deck](https://www.elgato.com/us/en/s/stream-deck-app). 최종 브랜드나 디자인은 아직 선택되지 않았습니다.
