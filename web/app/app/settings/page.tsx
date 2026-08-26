export default function Settings() {
  return (
    <section className="screen active" style={{ display: 'flex' }}>
      <div className="topbar"><h1>설정 · 구독</h1></div>
      <div className="content">
        <div className="set-grid">
          <div className="card set-card">
            <h3>로그인이 필요해요</h3>
            <p className="sub">둘러보기 모드입니다. 로그인하면 크레딧·API 키·구독을 관리할 수 있어요.</p>
            <a className="btn primary" href="/login">이메일로 로그인</a>
          </div>
          <div className="card set-card">
            <h3>API 키</h3>
            <p className="sub">OpenAI 키 하나로 대본·음성·이미지가 만들어집니다. 키는 암호화 저장되고 사용료는 내 계정에 직접 청구돼요.</p>
            <div className="key-row"><div><b>OpenAI</b><span className="mono" style={{ color: 'var(--faint)' }}>로그인 후 연결</span></div><span className="badge dim">미연결</span></div>
            <div className="key-row"><div><b>ElevenLabs</b><span className="mono" style={{ color: 'var(--faint)' }}>프리미엄 보이스 (선택)</span></div><span className="badge dim">미연결</span></div>
          </div>
        </div>
      </div>
    </section>
  );
}
