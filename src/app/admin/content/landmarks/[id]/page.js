import ContentEditor from '@/components/settings/ContentEditor';
export default async function Page({params}){const {id}=await params;return <ContentEditor scope="landmarks" id={id}/>;}
