'use client';
import {t as tr} from '@/lib/i18n';
import {useI18n} from '@/context/LanguageProvider';

import ProfileCard from '@/components/profile/ProfileCard';
import LanguageSetting from '@/components/profile/LanguageSetting';

export default function RiderProfilePage() {
  useI18n();
  return (
    <div className="content-pad" style={{ maxWidth: 640 }}>
      <h1 className="page-title">{tr("Profile")}</h1>
      <p className="page-sub mb-6">{tr("Your account details")}</p>
      <ProfileCard />
      <LanguageSetting />
    </div>
  );
}
