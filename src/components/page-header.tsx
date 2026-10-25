// 페이지 맨 위: 작은 안내 글 + 큰 제목 + 설명, 오른쪽에 버튼. 모양은 docs/design-guide.md 를 따른다.
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 border-b pb-6 sm:flex-row sm:items-end">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 className="page-title">{title}</h2>
        {description && <div className="mt-2 text-sm text-muted-foreground">{description}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
