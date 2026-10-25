"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "@/app/(auth)/actions";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SERVICE_NAME } from "@/lib/constants";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, {});

  return (
    <Card className="rounded-3xl py-9 [--card-spacing:--spacing(8)]">
      <CardHeader>
        <p className="eyebrow">{SERVICE_NAME}에 오신 것을 환영합니다</p>
        <CardTitle className="text-3xl font-black tracking-tight text-school-navy">로그인</CardTitle>
        <CardDescription className="mt-2 text-sm">학교에서 발급받은 아이디로 시작하세요.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="login_id">아이디</Label>
            <Input
              id="login_id"
              name="login_id"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">비밀번호</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <Link href="/recover" className="text-right text-xs underline">비밀번호를 잊었나요?</Link>
          <FormMessage state={state} />
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "로그인 중..." : "로그인"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            학생 계정은 학교에서 발급해요. 아이디를 모르면 담임 선생님께 문의하세요.
          </p>
          <p className="text-center text-sm text-muted-foreground">
            선생님이신가요?{" "}
            <Link href="/signup" className="font-medium text-foreground underline">
              교사 회원가입
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
