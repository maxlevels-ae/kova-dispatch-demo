import { AccountDetail } from '@/components/admin/Accounts';
export default async function Page({params}){const {id}=await params;return <AccountDetail id={id}/>;}
