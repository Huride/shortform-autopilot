import Link from 'next/link';
import Vid from '@/components/Vid';

const TEMPLATES = [
  { k: 'number', name: '넘버 앵커형', sub: '경제·재테크' },
  { k: 'critic', name: '소비자 비판형', sub: '소비자 이슈' },
  { k: 'brief', name: '데일리 브리핑형', sub: '뉴스 큐레이션' },
  { k: 'fact', name: '팩트체크형', sub: '검증 콘텐츠' },
  { k: 'story', name: '스토리텔링형', sub: '기업·인물 서사' },
];

export default function Home() {
  return (
    <div className="mk">
      <div className="wrap">
        <header className="top">
          <a className="mlogo" href="#"><span className="mlogo-mark">A</span>Autopilot</a>
          <nav style={{ display: 'flex', gap: 10 }}>
            <Link className="mbtn ghost" href="/login">로그인</Link>
            <Link className="mbtn primary" href="/login">무료로 시작하기</Link>
          </nav>
        </header>

        <div className="hero">
          <div>
            <span className="eyebrow">Shortform Autopilot</span>
            <h1>주제 한 줄이<br /><em>매일 영상</em>이 됩니다</h1>
            <p className="lead">뉴스 수집부터 대본, 보이스, 모션그래픽 렌더까지 — AI 에이전트가 운영하는 나만의 숏폼 채널. <b>당신은 하루 한 번 확인만 하세요.</b></p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Link className="mbtn primary" href="/login">무료로 시작하기</Link>
              <a className="mbtn ghost" href="#templates">템플릿 구경하기</a>
            </div>
            <p style={{ color: 'var(--faint)', fontSize: 13, marginTop: 18 }}>가입 즉시 첫 영상 무료 · 카드 등록 없음</p>
          </div>
          <div className="stage">
            <div className="glow" />
            <div>
              <div className="phone"><div className="screen" style={{ padding: 0 }}>
                <Vid src="/media/hero-kr.mp4" poster="/media/poster-hero.jpg" radius={26} fit="contain" />
              </div></div>
              <p className="caption-under">▲ ▶를 누르면 사운드와 함께 재생됩니다 — 이 영상은 <b>주제 한 줄</b>로 만들어졌습니다. 대본·성우·그래픽·편집 전 과정에 사람이 개입하지 않았어요.</p>
            </div>
          </div>
        </div>
      </div>

      <section>
        <div className="wrap">
          <div className="sec-head">
            <span className="eyebrow">How it works</span>
            <h2>세 단계면 채널이 굴러갑니다</h2>
            <p>편집 프로그램은 배울 필요 없습니다. 에이전트와 대화하며 채널을 만들고, 나머지는 파이프라인이 합니다.</p>
          </div>
          <div className="steps3">
            <div className="stepc"><div className="n">STEP 1</div><h3>주제를 정하면</h3><p>매일 뉴스에서 자동 선정하거나, 원하는 주제를 직접 입력하세요. 사실은 기사에서 출처와 함께 추출됩니다.</p><div className="t">⏱ 내가 쓰는 시간: 0~1분</div></div>
            <div className="stepc"><div className="n">STEP 2</div><h3>에이전트가 만듭니다</h3><p>대본 → 보이스 → 배경 아트 → 인포그래픽 렌더까지. 대본은 씬 단위로 직접 고치거나 채팅으로 수정하세요.</p><div className="t">⏱ 영상 한 편: 약 5분</div></div>
            <div className="stepc"><div className="n">STEP 3</div><h3>내보내고, 발행하고</h3><p>다운로드해서 직접 올리거나, 자동화 플랜에서 유튜브·인스타 예약 발행과 검증까지 맡기세요.</p><div className="t">⏱ 하루 확인: 탭 한 번</div></div>
          </div>
        </div>
      </section>

      <section id="templates">
        <div className="wrap">
          <div className="sec-head">
            <span className="eyebrow">Templates</span>
            <h2>검증된 포맷으로 시작하세요</h2>
            <p>템플릿은 대본 구조 + 논조 + 화면 연출의 묶음입니다. ▶를 눌러 사운드와 함께 확인하세요 — 다섯 편 모두 이 파이프라인이 실제로 렌더했습니다.</p>
          </div>
          <div className="tpl-row">
            {TEMPLATES.map((t) => (
              <div className="tplc" key={t.k}>
                <div className="mini" style={{ padding: 0 }}>
                  <Vid src={`/media/tpl-${t.k}-web.mp4`} poster={`/media/poster-${t.k}.jpg`} radius={0} />
                </div>
                <div className="lbl">{t.name}<small>{t.sub} · 실제 렌더 결과물</small></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="sec-head">
            <span className="eyebrow">Pricing</span>
            <h2>커피 몇 잔 값으로, 채널 하나</h2>
            <p>모든 플랜은 크레딧으로 씁니다 — 숏폼 1편 = 10크레딧. 부족하면 추가 구매도 가능해요.</p>
          </div>
          <div className="price-grid">
            <div className="price">
              <h3>크리에이터</h3>
              <div className="amount"><b>₩9,900</b><span className="per">/월</span></div>
              <ul>
                <li>월 150크레딧 (영상 약 12편 · 주 3편 페이스)</li>
                <li>채널 2개 · 템플릿 전체</li>
                <li>씬 에디터 + 에이전트 수정</li>
                <li>1080p 다운로드 · 워터마크 없음</li>
              </ul>
              <Link className="mbtn ghost" href="/login">무료로 시작</Link>
            </div>
            <div className="price hot">
              <span className="tag">가장 인기</span>
              <h3>오토파일럿</h3>
              <div className="amount"><b>₩29,000</b><span className="per">/월</span></div>
              <ul>
                <li>월 500크레딧 (영상 약 40편 · 매일 1편 + 여유)</li>
                <li>채널 5개</li>
                <li>유튜브 · 인스타 자동 예약 발행 + 검증</li>
                <li>매일 자동 편성 (뉴스 → 주제 → 영상)</li>
                <li>주간 결산 롱폼 · 카드뉴스 · 성과 비교</li>
              </ul>
              <Link className="mbtn primary" href="/login">무료로 시작</Link>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="sec-head"><span className="eyebrow">FAQ</span><h2>자주 묻는 질문</h2></div>
          <div className="faq">
            <details open><summary>정말 사람 없이 영상이 만들어지나요?</summary><p>네. 이 페이지의 영상들은 주제 한 줄 외에 사람의 편집이 전혀 들어가지 않았습니다. 다만 발행 전 확인 버튼은 당신 몫으로 남겨둡니다 — 내 채널에 뭐가 올라가는지는 내가 알아야 하니까요.</p></details>
            <details><summary>왜 내 OpenAI API 키가 필요한가요?</summary><p>AI 사용료에 마진을 붙여 되파는 대신, 원가 그대로 당신 계정에 청구되게 했습니다. 키 발급은 가이드 따라 5분이면 되고, 키는 암호화되어 저장되며 영상 생성에만 쓰입니다.</p></details>
            <details><summary>저작권이나 계정 정지 위험은 없나요?</summary><p>그래픽은 전부 코드로 그리고, 음악은 자체 제작 BGM, 실사는 상업 사용 가능한 스톡만 씁니다. 모든 영상에 AI 제작 고지가 들어가고 사실엔 출처가 붙습니다.</p></details>
            <details><summary>발행 자동화는 어떻게 가능한가요?</summary><p>자동 발행은 내 계정의 공식 API로 이뤄집니다. 유튜브는 구글 클라우드 프로젝트, 인스타그램은 메타 개발자 앱을 본인 계정으로 한 번 만들어 연결하는 설정이 필요해요 — 단계별 마법사와 스크린샷 가이드를 제공하고, 1회 20~30분이면 끝납니다. 설정 전에도 다운로드 후 직접 업로드는 즉시 가능합니다.</p></details>
          </div>
        </div>
      </section>

      <div className="wrap">
        <div className="final">
          <h2>내일 아침, 첫 영상이 기다리게 하세요</h2>
          <p>가입 즉시 첫 영상 무료 — 카드 등록 없이 시작합니다.</p>
          <Link className="mbtn primary" href="/login">무료로 시작하기</Link>
        </div>
        <footer>
          <span>© 2026 Autopilot</span>
          <span>이용약관 · 개인정보처리방침</span>
        </footer>
      </div>
    </div>
  );
}
