'use client';
import Link from 'next/link';
import {useEffect,useRef} from 'react';
import {ArrowRight,CalendarClock,Wallet,PackageCheck,Package,Truck,Car,ShieldCheck,MapPin} from 'lucide-react';
import './services.css';

const SMALL=[
  {icon:CalendarClock,title:'Scheduled rides',text:'Book ahead for airport runs and early mornings.'},
  {icon:Wallet,title:'Maxride Wallet',text:'Top up once and pay for rides and deliveries in a tap.'},
  {icon:ShieldCheck,title:'Verified handover',text:'PIN for rides, confirmation codes for parcels.'},
];

export default function ServicesSection(){
  const root=useRef(null);
  useEffect(()=>{
    const nodes=root.current?.querySelectorAll('[data-reveal]');if(!nodes?.length)return;
    if(!('IntersectionObserver' in window)){nodes.forEach(n=>n.classList.add('in'));return;}
    const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}}),{threshold:.15});
    nodes.forEach(n=>io.observe(n));return()=>io.disconnect();
  },[]);
  return (
    <section className="svc" ref={root} aria-labelledby="svc-title">
      <div className="svc-inner">
        <span className="eyebrow" data-reveal>Our services</span>
        <h2 id="svc-title" data-reveal style={{fontSize:'2rem',marginTop:10,maxWidth:560}}>One app, every way to get things moving</h2>
        <div className="svc-grid">
          <article className="svc-card svc-taxi" data-reveal style={{'--d':'0ms'}}>
            <div className="svc-copy">
              <span className="svc-icon"><Car size={20}/></span>
              <h3>Taxi rides</h3>
              <p>Economy, Comfort, Premium and XL. Upfront fares, live tracking and drivers matched in seconds.</p>
              <Link href="/signup" className="btn btn-primary">Book a ride <ArrowRight size={16}/></Link>
            </div>
            <div className="svc-visual" aria-hidden="true">
              <div className="svc-road"/>
              <img className="svc-car" src="/rider-assets/v/premium_card.png" alt=""/>
              <span className="svc-pin"><MapPin size={16}/></span>
            </div>
          </article>
          <article className="svc-card svc-delivery" data-reveal style={{'--d':'120ms'}}>
            <div className="svc-copy">
              <span className="svc-icon"><PackageCheck size={20}/></span>
              <h3>Box Delivery</h3>
              <p>Send a parcel across town or have something brought to you. Track your courier live from pickup to doorstep.</p>
              <Link href="/signup" className="btn btn-primary">Send a package <ArrowRight size={16}/></Link>
            </div>
            <div className="svc-visual" aria-hidden="true">
              <div className="svc-route"><i/><i/><i/><i/><i/><b><Truck size={11}/></b></div>
              <span className="svc-parcel"><Package size={34}/></span>
            </div>
          </article>
        </div>
        <div className="svc-small">
          {SMALL.map(({icon:Icon,title,text},i)=>(
            <div key={title} className="svc-mini" data-reveal style={{'--d':(i*100+200)+'ms'}}>
              <span className="svc-icon"><Icon size={18}/></span>
              <div><h4>{title}</h4><p>{text}</p></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
