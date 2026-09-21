import Link from 'next/link';
import Vid from '@/components/Vid';

/**
 * 공개 샘플 갤러리 — 로그인 없이 완성 영상을 바로 본다 (심사·투표용).
 * 영상은 실제 서비스가 렌더한 결과물(Supabase 공개 버킷). 목록은 수동 큐레이션.
 */
const SAMPLES = [
  { url: 'https://rqinxpyqtlubcydcsqvs.supabase.co/storage/v1/object/public/videos/ae84e25b-4d45-4468-b021-f4182c3afc38/2213c003-9edc-4fb2-8398-33b63203d55f.mp4', topic: '통신 3사, 5G 중간요금제 일제 개편', tpl: '소비자 비판형', art: '시네마틱 배경', note: '뉴스 6건 본문에서 팩트 추출 → 요금제 "명분"과 실제 부담을 대조' },
  { url: 'https://rqinxpyqtlubcydcsqvs.supabase.co/storage/v1/object/public/videos/ae84e25b-4d45-4468-b021-f4182c3afc38/2458a42d-356c-400b-a833-11ed35a170be.mp4', topic: '연임 개헌 가능성', tpl: '팩트체크형', art: '생성 아트', note: '의혹 → 확인된 발언 → "판정, 사실 아님" → 확인할 신호 하나로 착지' },
  { url: 'https://rqinxpyqtlubcydcsqvs.supabase.co/storage/v1/object/public/videos/ae84e25b-4d45-4468-b021-f4182c3afc38/ea7edd4a-f128-4f63-b6a7-315e65124f81.mp4', topic: '혈당 관리 비법 — 다이어트와 혈당의 관계', tpl: '스토리텔링형', art: '실사풍 배경', note: '연속혈당측정기 트렌드로 시작하는 서사, 발단→정점→반전→여운' },
  { url: 'https://rqinxpyqtlubcydcsqvs.supabase.co/storage/v1/object/public/videos/ae84e25b-4d45-4468-b021-f4182c3afc38/5fd5b204-24a5-497c-b2ce-d3f48c130d8c.mp4', topic: '공동명의 1주택, 2주택으로 볼까?', tpl: '팩트체크형', art: '실사풍 + 씬 전용 생성', note: '세금 제도 주제 — 씬별로 다른 이미지를 생성해 화면 변화를 만든 편' },
  { url: 'https://rqinxpyqtlubcydcsqvs.supabase.co/storage/v1/object/public/videos/ae84e25b-4d45-4468-b021-f4182c3afc38/29189ad4-31ad-4f07-95ae-312c7321158a.mp4', topic: '피터 틸은 악마인가?', tpl: '스토리텔링형', art: '채널 기본 아트', note: '인물 서사 — 가드레일(단정 금지·의혹 표기)이 실제로 작동한 편' },
  { url: 'https://rqinxpyqtlubcydcsqvs.supabase.co/storage/v1/object/public/videos/ae84e25b-4d45-4468-b021-f4182c3afc38/cbcfb3b4-3782-49c4-a723-160de8b20725.mp4', topic: '편의점 도시락 가격, 3년 새 얼마나 올랐나', tpl: '넘버 앵커형', art: '채널 기본 아트', note: '숫자 하나를 앵커로 심고 마지막에 회수하는 구조' },
];

export default function Showcase() {
  return (
    <div className="mk">
      <div className="wrap">
        <header className="top">
          <Link className="mlogo" href="/"><span className="mlogo-mark">A</span>Autopilot</Link>
          <nav style={{ display: 'flex', gap: 10 }}>
            <Link className="mbtn ghost" href="/login">로그인</Link>
            <Link className="mbtn primary" href="/login">무료로 시작하기</Link>
          </nav>
        </header>
        <div className="sec-head" style={{ paddingTop: 24 }}>
          <span className="eyebrow">Showcase</span>
          <h2>주제 한 줄로 만들어진 실제 결과물</h2>
          <p>아래 영상은 전부 이 서비스가 주제 한 줄에서 자동으로 만든 것입니다 — 뉴스 수집·팩트락 대본·보이스·배경 아트·인포그래픽·렌더까지 사람이 편집한 컷은 없습니다. ▶를 누르면 사운드와 함께 재생돼요. 로그인 없이 볼 수 있습니다.</p>
        </div>
        <div className="tpl-row" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', display: 'grid', gap: 22 }}>
          {SAMPLES.map((s) => (
            <div className="tplc" key={s.url}>
              <div className="mini" style={{ padding: 0 }}>
                <Vid src={s.url} poster="" radius={0} />
              </div>
              <div className="lbl" style={{ display: 'block' }}>
                <b style={{ display: 'block', fontSize: 14 }}>{s.topic}</b>
                <small style={{ display: 'block', margin: '4px 0' }}>{s.tpl} · {s.art}</small>
                <small style={{ display: 'block', color: 'var(--sub)', lineHeight: 1.5 }}>{s.note}</small>
              </div>
            </div>
          ))}
        </div>
        <div className="final" style={{ marginTop: 48 }}>
          <h2>직접 만들어 보기 — 가입 후 첫 1편은 API 키 없이 무료</h2>
          <p>주제를 넣고 5분 뒤 에디터에서 대본을 고치고 렌더하세요. 카드 등록 없음.</p>
          <Link className="mbtn primary" href="/login">무료로 시작하기</Link>
        </div>
        <footer><span>© 2026 Autopilot</span><span>원티드 AI Championship 2026 출품작</span></footer>
      </div>
    </div>
  );
}
