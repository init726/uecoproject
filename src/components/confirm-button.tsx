"use client";

import { SubmitButton } from "@/components/submit-button";

// 누르면 "정말요?" 확인을 먼저 묻는 제출 버튼. 취소하면 폼이 제출되지 않는다.
export function ConfirmButton({
  confirm,
  ...props
}: React.ComponentProps<typeof SubmitButton> & { confirm: string }) {
  return (
    <SubmitButton
      {...props}
      onClick={(event) => {
        if (!window.confirm(confirm)) event.preventDefault();
      }}
    />
  );
}
