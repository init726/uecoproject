// 페이지를 옮길 때 서버 응답을 기다리는 동안 바로 보여주는 뼈대 화면.
// 메뉴(화면 틀)는 그대로 있고 본문 자리만 바뀐다.
export default function Loading() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-busy="true" aria-label="불러오는 중">
      <div className="flex flex-col gap-2">
        <div className="h-4 w-24 rounded bg-muted" />
        <div className="h-7 w-48 rounded bg-muted" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="h-20 rounded-xl bg-muted" />
        <div className="h-20 rounded-xl bg-muted" />
        <div className="h-20 rounded-xl bg-muted" />
      </div>
      <div className="flex flex-col gap-2">
        <div className="h-16 rounded-xl bg-muted" />
        <div className="h-16 rounded-xl bg-muted" />
        <div className="h-16 rounded-xl bg-muted" />
      </div>
    </div>
  );
}
