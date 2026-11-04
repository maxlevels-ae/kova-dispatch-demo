'use client';
import {useEffect,useState} from 'react';
export default function useServiceAvailability(enabled=true){const [services,setServices]=useState(null);useEffect(()=>{if(!enabled)return;let live=true;const load=async()=>{try{const response=await fetch('/api/services');if(response.ok){const data=await response.json();if(live)setServices(data);}}catch{}};load();const timer=setInterval(load,10000);window.addEventListener('focus',load);return()=>{live=false;clearInterval(timer);window.removeEventListener('focus',load);};},[enabled]);return services;}
