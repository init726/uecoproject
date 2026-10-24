"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signupTeacher } from "@/app/(auth)/actions";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { USERNAME_RULE } from "@/lib/username";

// 교사 회원가입 (관리자 승인 후 사용). 학생 계정은 관리자가 단체로 발급한다.
export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signupTeacher, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle>교사 회원가입</CardTitle>
        <CardDescription>관리자가 승인한 뒤에 사용할 수 있어요.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">이름</Label>
              <Input id="name" name="name" autoComplete="name" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="subject">담당 교과</Label>
              <Input id="subject" name="subject" placeholder="수학" required />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="username">아이디</Label>
            <Input
              id="username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              pattern="[A-Za-z0-9_]{4,20}"
              required
            />
            <p className="text-xs text-muted-foreground">{USERNAME_RULE}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">비밀번호 (8자 이상)</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>

          <div className="rounded-lg bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">개인정보 수집·이용 안내</p>
            <p>수집 항목: 이름, 담당 교과, 아이디</p>
            <p>이용 목적: 로그인, 수업 운영</p>
            <p>보관 기간: 탈퇴 시까지</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="privacy" required className="size-4" />
            위 내용에 동의합니다.
          </label>

          <FormMessage state={state} />
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "가입 중..." : "가입하기"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            이미 계정이 있나요?{" "}
            <Link href="/login" className="font-medium text-foreground underline">
              로그인
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
