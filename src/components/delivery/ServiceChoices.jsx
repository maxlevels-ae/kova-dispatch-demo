'use client';
import Link from 'next/link';
import {Car,Package} from 'lucide-react';
import {useI18n} from '@/context/LanguageProvider';
import {t} from '@/lib/i18n';
export default function ServiceChoices({services}){useI18n();return <nav className="service-choices" aria-label={t('Choose your service')}>{services?.taxiEnabled&&<Link className="service-choice active" href="/dashboard"><Car size={21}/><span>{t('Book a Ride')}</span></Link>}{services?.deliveryEnabled&&<Link className="service-choice" href="/deliveries/new"><Package size={21}/><span>{t('Send a Package')}</span></Link>}</nav>;}
