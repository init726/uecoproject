import Link from "next/link";
import {RecoveryForm} from "./recovery-form";
export default function Recover(){return <div className="school-panel p-6 space-y-5"><h1 className="page-title">계정 복구 요청</h1><p className="text-sm text-muted-foreground">학교 담당자가 본인을 확인한 뒤 비밀번호를 초기화합니다.</p><RecoveryForm/><Link className="block text-sm underline" href="/login">로그인으로 돌아가기</Link></div>;}
