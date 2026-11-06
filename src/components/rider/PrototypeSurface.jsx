'use client';
// Ported directly from the canonical HTML by scripts/compile-rider-reference.py.
// Business data/actions are injected by RiderExperience, never the prototype runtime.
import {Fragment} from 'react';
import {t as defaultTranslate} from '@/lib/i18n';
export default function PrototypeSurface({v,translate=defaultTranslate}) { const t=value=>{const translated=translate(value);return typeof value==='string'&&typeof translated==='string'&&value!==translated?(value.match(/^\s*/)?.[0]||'')+translated+(value.match(/\s*$/)?.[0]||''):translated;}; return <>
{v.isHome && <><div style={{"position":"absolute","inset":"0","background":"#f6f1ea","overflow":"hidden"}} data-prototype-state="isHome"><div style={{"position":"absolute","inset":"0","overflowY":"auto","padding":"calc(env(safe-area-inset-top, 0px) + 16px) 20px 110px","boxSizing":"border-box","scrollbarWidth":"none"}}><div style={{"display":"flex","alignItems":"center","justifyContent":"space-between","marginTop":"0"}}><div><div style={{"fontSize":"16px","color":"#666"}}>{v.greeting}</div>
<div style={{"fontSize":"30px","fontWeight":"700","lineHeight":"1.15"}}>{v.firstName}</div>
</div>
<div style={{"width":"64px","height":"64px","borderRadius":"50%","background":"repeating-linear-gradient(45deg,#e3dbcf 0 6px,#d9d0c2 6px 12px)","border":"3px solid #fff","boxShadow":"0 2px 10px rgba(60,40,20,.12)","display":"flex","alignItems":"center","justifyContent":"center","font":"10px ui-monospace,monospace","color":"#6b6155"}}>{v.avatar}</div>
</div>
<button onClick={v.goMap} style={{"width":"100%","marginTop":"20px","display":"flex","alignItems":"center","gap":"12px","background":"#fff","border":"0","borderRadius":"18px","padding":"20px 18px","fontSize":"20px","fontWeight":"700","textAlign":"start","boxShadow":"0 4px 16px rgba(60,40,20,.09)"}} type="button"><img src="/rider-assets/icons/pickup.svg" style={{"width":"26px"}} alt=""/>{t("Where to?")}<span style={{"marginInlineStart":"auto","display":"flex","alignItems":"center","gap":"6px","background":"#f1ece4","padding":"7px 12px","borderRadius":"20px","fontSize":"13px","fontWeight":"500"}} data-schedule="true"><img src="/rider-assets/icons/clock.svg" style={{"width":"14px"}} alt=""/>{v.nowLabel}</span>
</button>
<div style={{"display":"flex","gap":"10px","marginTop":"16px"}}><button onClick={v.savedHome} style={{"flex":"1","display":"flex","flexDirection":"column","alignItems":"center","gap":"8px","background":"#fff","border":"0","borderRadius":"18px","padding":"16px 4px 14px","boxShadow":"0 2px 10px rgba(60,40,20,.07)","fontSize":"14px","fontWeight":"700","color":"#111"}} type="button"><img src="/rider-assets/icons/home.svg" style={{"width":"26px"}} alt=""/>{t("Home")}</button>
<button onClick={v.savedWork} style={{"flex":"1","display":"flex","flexDirection":"column","alignItems":"center","gap":"8px","background":"#fff","border":"0","borderRadius":"18px","padding":"16px 4px 14px","boxShadow":"0 2px 10px rgba(60,40,20,.07)","fontSize":"14px","fontWeight":"700","color":"#111"}} type="button"><img src="/rider-assets/icons/work.svg" style={{"width":"26px"}} alt=""/>{t("Work")}</button>
<button onClick={v.savedPlaces} style={{"flex":"1","display":"flex","flexDirection":"column","alignItems":"center","gap":"8px","background":"#fff","border":"0","borderRadius":"18px","padding":"16px 4px 14px","boxShadow":"0 2px 10px rgba(60,40,20,.07)","fontSize":"14px","fontWeight":"700","color":"#111"}} type="button"><img src="/rider-assets/icons/saved_places.svg" style={{"width":"26px"}} alt=""/>{t("Saved Places")}</button>
</div>
<div style={{"display":"flex","gap":"12px","marginTop":"16px"}}><button onClick={v.goMap} style={{"flex":"1","minWidth":"0","aspectRatio":"662/618","border":"0","padding":"0","background":"none","borderRadius":"20px","boxShadow":"0 2px 10px rgba(60,40,20,.1)"}} disabled={v.taxiDisabled} aria-label={t("Book a Ride")} type="button"><img src="/rider-assets/tile_car.png" style={{"width":"100%","height":"100%","display":"block","borderRadius":"20px"}} alt=""/></button>
<button onClick={v.goDelivery} style={{"flex":"1","minWidth":"0","aspectRatio":"662/618","border":"0","padding":"0","background":"none","borderRadius":"20px","boxShadow":"0 2px 10px rgba(60,40,20,.1)"}} disabled={v.deliveryDisabled} aria-label={t("Send a Package")} type="button"><img src="/rider-assets/tile_delivery.png" style={{"width":"100%","height":"100%","display":"block","borderRadius":"20px"}} alt=""/></button>
</div>
<div style={{"marginTop":"16px","borderRadius":"20px","overflow":"hidden","position":"relative","height":"130px"}}><div style={{"display":"flex","height":"100%","width":"100%","transform":"translateX(" + v.heroX + ")","transition":"transform .5s ease"}}>{v.slides.map((sl,index)=><Fragment key={sl.id || index}><div onClick={sl.go} style={{"flex":"none","width":"100%","height":"100%","position":"relative","background":sl.bg,"cursor":"pointer"}} role="button" tabIndex="0" onKeyDown={sl.key}><div style={{"position":"absolute","inset":"0","background":"linear-gradient(90deg,rgba(20,15,10,.7),rgba(20,15,10,0) 80%)"}}></div>
<div style={{"position":"absolute","insetInlineStart":"18px","top":"50%","transform":"translateY(-50%)","color":"#fff","fontSize":"19px","fontWeight":"700","lineHeight":"1.25","maxWidth":"210px"}}>{sl.t1}<div style={{"fontSize":"13px","fontWeight":"500","marginTop":"4px","opacity":"1"}}>{sl.t2}</div>
</div>
<span style={{"position":"absolute","insetInlineEnd":"14px","bottom":"8px","font":"10px ui-monospace,monospace","color":"#fff"}}></span>
</div>
</Fragment>)}</div>
<button onClick={v.nextHero} style={{"position":"absolute","insetInlineEnd":"12px","top":"50%","marginTop":"-18px","width":"36px","height":"36px","borderRadius":"50%","border":"0","background":"rgba(0,0,0,.6)","display":"flex","alignItems":"center","justifyContent":"center"}} aria-label={t("Next banner")} disabled={v.noHeroes} type="button"><img src="/rider-assets/icons/forward.svg" style={{"width":"14px","filter":"invert(1)"}} alt=""/></button>
</div>
<div style={{"display":"flex","justifyContent":"center","gap":"6px","marginTop":"10px"}}>{v.dots.map((d,index)=><Fragment key={d.id || index}><button onClick={d.go} style={{"border":"0","padding":"0","height":"7px","borderRadius":"4px","width":d.w,"background":d.c,"transition":"all .3s"}} aria-label={d.label} type="button"></button>
</Fragment>)}</div>
<div style={{"display":"flex","alignItems":"baseline","justifyContent":"space-between","marginTop":"24px"}}><span style={{"fontSize":"20px","fontWeight":"700"}}>{v.exploreTitle}</span>
<button onClick={v.exploreAll} style={{"border":"0","background":"none","padding":"0","fontSize":"13px","fontWeight":"700","color":"#111","textDecoration":"underline"}} type="button">{v.exploreCta}</button>
</div>
<div style={{"display":"flex","gap":"14px","margin":"14px -20px 0","padding":"0 20px 6px","overflowX":"auto","scrollbarWidth":"none"}}>{v.sights.map((pl,index)=><Fragment key={pl.id || index}><button onClick={pl.open} style={{"flex":"none","width":"84px","border":"0","padding":"0","background":"none","display":"flex","flexDirection":"column","alignItems":"center","gap":"8px"}} type="button"><div style={{"width":"84px","height":"84px","borderRadius":"50%","background":pl.bg,"border":"3px solid #fff","boxShadow":"0 2px 10px rgba(60,40,20,.15)","boxSizing":"border-box"}}></div>
<span style={{"fontSize":"13px","fontWeight":"700","color":"#111","textAlign":"center","lineHeight":"1.2"}}>{pl.name}</span>
</button>
</Fragment>)}</div>
</div>
<div style={{"position":"absolute","insetInlineStart":"14px","insetInlineEnd":"14px","bottom":"16px","height":"70px","background":"#fff","borderRadius":"24px","boxShadow":"0 4px 20px rgba(60,40,20,.12)","display":"flex","justifyContent":"space-around","alignItems":"center"}}><button style={{"display":"flex","flexDirection":"column","alignItems":"center","gap":"4px","fontSize":"12px","fontWeight":"700","color":"#111","opacity":"1","border":"0","background":"none","padding":"0"}} onClick={v.goHome} type="button"><img src="/rider-assets/icons/home.svg" style={{"width":"24px"}} alt=""/>{t("Home")}</button>
<button style={{"display":"flex","flexDirection":"column","alignItems":"center","gap":"4px","fontSize":"12px","fontWeight":"500","color":"#777","opacity":"0.8","border":"0","background":"none","padding":"0"}} onClick={v.history} type="button"><img src="/rider-assets/icons/clock.svg" style={{"width":"24px"}} alt=""/>{t("Trips")}</button>
<button style={{"display":"flex","flexDirection":"column","alignItems":"center","gap":"4px","fontSize":"12px","fontWeight":"500","color":"#777","opacity":"0.8","border":"0","background":"none","padding":"0"}} onClick={v.wallet} type="button"><img src="/rider-assets/icons/wallet.svg" style={{"width":"24px"}} alt=""/>{t("Wallet")}</button>
<button onClick={v.openMenu} style={{"cursor":"pointer","display":"flex","flexDirection":"column","alignItems":"center","gap":"4px","fontSize":"12px","fontWeight":"500","color":"#777","opacity":"0.8","border":"0","background":"none","padding":"0"}} type="button"><img src="/rider-assets/icons/user.svg" style={{"width":"24px"}} alt=""/>{t("Account")}</button>
</div>
</div>
</>}{v.isMap && <><div data-prototype-state="isMap"><button onClick={v.goHome} style={{"position":"absolute","top":"62px","insetInlineStart":"20px","width":"46px","height":"46px","borderRadius":"50%","border":"0","background":"#fff","boxShadow":"0 2px 10px rgba(0,0,0,.15)","display":"flex","alignItems":"center","justifyContent":"center"}} aria-label={t("Back")} type="button"><img src="/rider-assets/icons/back.svg" style={{"width":"20px"}} alt=""/></button>
<div style={{"position":"absolute","insetInlineStart":"0","insetInlineEnd":"0","bottom":"0","background":"#faf8f5","borderRadius":"28px 28px 0 0","padding":"14px 20px 34px","boxShadow":"0 -6px 30px rgba(0,0,0,.12)"}}><div style={{"width":"40px","height":"4px","background":"#d6d1c8","borderRadius":"2px","margin":"0 auto 16px"}}></div>
<div style={{"fontSize":"26px","fontWeight":"700","marginBottom":"14px"}}>{v.greetingName}</div>
<button onClick={v.goSearch} style={{"width":"100%","display":"flex","alignItems":"center","gap":"12px","background":"#ece8e1","border":"0","borderRadius":"14px","padding":"17px 16px","fontSize":"18px","fontWeight":"500","textAlign":"start"}} type="button"><img src="/rider-assets/icons/search.svg" style={{"width":"22px"}} alt=""/>{t("Where to?")}<span style={{"marginInlineStart":"auto","display":"flex","alignItems":"center","gap":"6px","background":"#fff","padding":"7px 12px","borderRadius":"20px","fontSize":"14px"}} data-schedule="true"><img src="/rider-assets/icons/clock.svg" style={{"width":"15px"}} alt=""/>{v.nowLabel}</span>
</button>
{v.saved.map((s,index)=><Fragment key={s.id || index}><button onClick={s.pick} style={{"width":"100%","display":"flex","alignItems":"center","gap":"14px","background":"none","border":"0","padding":"14px 4px","borderBottom":"1px solid #ece8e1","textAlign":"start"}} type="button"><span style={{"width":"38px","height":"38px","borderRadius":"50%","background":"#ece8e1","display":"flex","alignItems":"center","justifyContent":"center"}}><img src={s.icon} style={{"width":"19px"}} alt=""/></span>
<span><div style={{"fontSize":"16px","fontWeight":"500"}}>{s.name}</div>
<div style={{"fontSize":"13px","color":"#777"}}>{s.addr}</div>
</span>
</button>
</Fragment>)}</div>
</div>
</>}{v.isPlace && <><div style={{"position":"absolute","inset":"0","background":"#faf8f5","overflow":"hidden"}} data-prototype-state="isPlace"><div style={{"position":"absolute","inset":"0","overflowY":"auto","paddingBottom":"110px","scrollbarWidth":"none"}}><div style={{"height":"290px","background":v.pl.bg,"position":"relative"}}><span style={{"position":"absolute","insetInlineStart":"20px","bottom":"12px","font":"10px ui-monospace,monospace","color":"#fff"}}></span>
</div>
<div style={{"padding":"20px"}}><div style={{"display":"flex","alignItems":"baseline","gap":"10px"}}><span style={{"fontSize":"28px","fontWeight":"700"}}>{v.pl.name}</span>
<span style={{"fontSize":"16px","color":"#777"}}>{v.pl.ar}</span>
</div>
<div style={{"fontSize":"14px","color":"#777","marginTop":"2px"}}>{v.pl.loc}</div>
<div style={{"display":"flex","gap":"8px","marginTop":"16px","flexWrap":"wrap"}}><span style={{"background":"#ece8e1","borderRadius":"20px","padding":"7px 12px","fontSize":"13px","fontWeight":"500"}}>{v.pl.distanceLabel}</span>
<span style={{"background":"#ece8e1","borderRadius":"20px","padding":"7px 12px","fontSize":"13px","fontWeight":"500"}}>{v.pl.time}</span>
<span style={{"background":"#ece8e1","borderRadius":"20px","padding":"7px 12px","fontSize":"13px","fontWeight":"500"}}>{v.pl.region}</span>
</div>
<div style={{"fontSize":"15px","lineHeight":"1.5","marginTop":"18px","color":"#333"}}>{v.pl.info}</div>
<div style={{"fontSize":"16px","fontWeight":"700","margin":"22px 0 10px"}}>{t("Photos")}</div>
<div style={{"display":"flex","gap":"10px"}}>{v.pl.gal.map((g,index)=><Fragment key={g.id || index}><div style={{"flex":"1","height":"90px","borderRadius":"14px","background":g}}></div>
</Fragment>)}</div>
</div>
</div>
<button onClick={v.goHome} style={{"position":"absolute","top":"62px","insetInlineStart":"20px","width":"46px","height":"46px","borderRadius":"50%","border":"0","background":"#fff","boxShadow":"0 2px 10px rgba(0,0,0,.15)","display":"flex","alignItems":"center","justifyContent":"center"}} aria-label={t("Back")} type="button"><img src="/rider-assets/icons/back.svg" style={{"width":"20px"}} alt=""/></button>
<div style={{"position":"absolute","insetInlineStart":"0","insetInlineEnd":"0","bottom":"0","padding":"14px 20px 30px","background":"#faf8f5","boxShadow":"0 -6px 24px rgba(0,0,0,.08)"}}><button onClick={v.bookPlace} style={{"width":"100%","height":"56px","border":"0","borderRadius":"14px","background":"#111","color":"#fff","fontSize":"17px","fontWeight":"700"}} type="button">{t("Book a ride to ")}{v.pl.name}</button>
</div>
</div>
</>}{v.isGrid && <><div style={{"position":"absolute","inset":"0","background":"#f6f1ea","overflow":"hidden"}} data-prototype-state="isGrid"><div style={{"position":"absolute","inset":"0","overflowY":"auto","padding":"62px 20px 30px","boxSizing":"border-box","scrollbarWidth":"none"}}><div style={{"display":"flex","alignItems":"center","gap":"14px","marginBottom":"6px"}}><button onClick={v.goHome} style={{"border":"0","background":"none","padding":"6px"}} aria-label={t("Back")} type="button"><img src="/rider-assets/icons/back.svg" style={{"width":"24px"}} alt=""/></button>
<span style={{"fontSize":"22px","fontWeight":"700"}}>{v.exploreTitle}</span>
</div>
<div style={{"fontSize":"14px","color":"#777","margin":"0 4px 16px"}}>{t("Tap a place for details and to book a ride")}</div>
<div style={{"display":"grid","gridTemplateColumns":"1fr 1fr","gap":"12px"}}>{v.sights.map((pl,index)=><Fragment key={pl.id || index}><button onClick={pl.open} style={{"border":"0","padding":"0","background":"#fff","borderRadius":"18px","overflow":"hidden","textAlign":"start","boxShadow":"0 2px 10px rgba(60,40,20,.08)"}} type="button"><div style={{"height":"120px","background":pl.bg,"position":"relative"}}><span style={{"position":"absolute","insetInlineStart":"8px","bottom":"6px","font":"9px ui-monospace,monospace","color":"#fff"}}></span>
</div>
<div style={{"padding":"10px 12px 12px"}}><div style={{"fontSize":"15px","fontWeight":"700"}}>{pl.name}</div>
<div style={{"fontSize":"12px","color":"#777","marginTop":"2px"}}>{pl.ar}{t(" · ")}{pl.km}</div>
<div style={{"fontSize":"12px","color":"#777","marginTop":"2px"}}>{pl.time}</div>
</div>
</button>
</Fragment>)}</div>
</div>
</div>
</>}{v.isSearch && <><div style={{"position":"absolute","inset":"0","background":"#faf8f5","padding":"62px 20px 0","boxSizing":"border-box"}} data-prototype-state="isSearch"><div style={{"display":"flex","alignItems":"center","gap":"14px","marginBottom":"18px"}}><button onClick={v.goHome} style={{"border":"0","background":"none","padding":"6px"}} aria-label={t("Back")} type="button"><img src="/rider-assets/icons/back.svg" style={{"width":"24px"}} alt=""/></button>
<span style={{"fontSize":"22px","fontWeight":"700"}}>{t("Plan your ride")}</span>
</div>
<div style={{"display":"flex","gap":"12px","background":"#ece8e1","borderRadius":"16px","padding":"14px"}}><div style={{"display":"flex","flexDirection":"column","alignItems":"center","padding":"6px 0"}}><span style={{"width":"10px","height":"10px","borderRadius":"50%","background":"#2563eb"}}></span>
<span style={{"width":"2px","flex":"1","background":"#bbb","margin":"3px 0"}}></span>
<span style={{"width":"10px","height":"10px","background":"#111"}}></span>
</div>
<div style={{"flex":"1","display":"flex","flexDirection":"column","gap":"10px"}}><div style={{"background":"#fff","borderRadius":"10px","padding":"12px","fontSize":"16px"}}>{v.pickupInput}</div>
<div style={{"background":"#fff","borderRadius":"10px","padding":"12px","fontSize":"16px","border":"2px solid #111","color":"#111"}}>{v.destinationInput}</div>
</div>
</div>
<div style={{"fontSize":"13px","fontWeight":"700","color":"#777","margin":"22px 0 4px","letterSpacing":".06em"}}>{t("SUGGESTED")}</div>
{v.places.map((p,index)=><Fragment key={p.id || index}><button onClick={p.pick} style={{"width":"100%","display":"flex","alignItems":"center","gap":"14px","background":"none","border":"0","padding":"14px 2px","borderBottom":"1px solid #ece8e1","textAlign":"start"}} type="button"><span style={{"width":"38px","height":"38px","borderRadius":"50%","background":"#ece8e1","display":"flex","alignItems":"center","justifyContent":"center"}}><img src="/rider-assets/icons/pickup.svg" style={{"width":"19px"}} alt=""/></span>
<span style={{"flex":"1"}}><div style={{"fontSize":"16px","fontWeight":"500"}}>{p.name}</div>
<div style={{"fontSize":"13px","color":"#777"}}>{p.addr}</div>
</span>
<span style={{"fontSize":"13px","color":"#777"}}>{p.dist}</span>
</button>
</Fragment>)}</div>
</>}{v.isOptions && <><div data-prototype-state="isOptions">{v.showPay && <><div style={{"position":"absolute","inset":"0","background":"rgba(0,0,0,.4)","zIndex":"8","display":"flex","alignItems":"flex-end"}} data-prototype-state="showPay"><div style={{"width":"100%","background":"#faf8f5","borderRadius":"28px 28px 0 0","padding":"18px 20px 34px","boxSizing":"border-box"}}><div style={{"display":"flex","justifyContent":"space-between","alignItems":"center","marginBottom":"8px"}}><span style={{"fontSize":"20px","fontWeight":"700"}}>{t("Payment method")}</span>
<button onClick={v.closePay} style={{"border":"0","background":"none","padding":"6px"}} aria-label={t("Close")} type="button"><img src="/rider-assets/icons/close.svg" style={{"width":"18px"}} alt=""/></button>
</div>
{v.payOpts.map((o,index)=><Fragment key={o.id || index}><button onClick={o.pick} style={{"width":"100%","display":"flex","alignItems":"center","gap":"14px","background":"none","border":"0","padding":"14px 2px","borderBottom":"1px solid #ece8e1","textAlign":"start","fontSize":"16px","fontWeight":"500"}} type="button"><span style={{"width":"38px","height":"38px","borderRadius":"50%","background":"#ece8e1","display":"flex","alignItems":"center","justifyContent":"center"}}><img src={o.icon} style={{"width":"19px"}} alt=""/></span>
<span style={{"flex":"1"}}>{o.label}<div style={{"fontSize":"12px","color":"#777"}}>{o.sub}</div>
</span>
<span style={{"width":"22px","height":"22px","borderRadius":"50%","border":"2px solid #111","background":o.dot}}></span>
</button>
</Fragment>)}</div>
</div>
</>}<button onClick={v.goSearch} style={{"position":"absolute","top":"62px","insetInlineStart":"20px","width":"46px","height":"46px","borderRadius":"50%","border":"0","background":"#fff","boxShadow":"0 2px 10px rgba(0,0,0,.15)","display":"flex","alignItems":"center","justifyContent":"center"}} aria-label={t("Back")} type="button"><img src="/rider-assets/icons/back.svg" style={{"width":"20px"}} alt=""/></button>
<div style={{"position":"absolute","insetInlineStart":"0","insetInlineEnd":"0","bottom":"0","background":"#faf8f5","borderRadius":"24px 24px 0 0","padding":"8px 14px 12px","boxShadow":"0 -6px 30px rgba(0,0,0,.12)"}}><div style={{"width":"40px","height":"4px","background":"#d6d1c8","borderRadius":"2px","margin":"0 auto 6px"}}></div>
<div style={{"fontSize":"16px","fontWeight":"700","margin":"0 4px 4px"}}>{t("Choose a ride ")}<span style={{"fontWeight":"400","color":"#777","fontSize":"14px"}}>{t("· ")}{v.dest}</span>
</div>
{v.rides.map((r,index)=><Fragment key={r.id || index}><button onClick={r.select} style={{"width":"100%","display":"flex","alignItems":"center","gap":"6px","background":r.bg,"border":"2px solid " + r.bd,"borderRadius":"14px","padding":"2px 12px 2px 2px","marginBottom":"4px","textAlign":"start"}} type="button"><img src={r.img} style={{"width":"68px","height":"46px","objectFit":"contain"}} alt=""/><span style={{"flex":"1"}}><div style={{"fontSize":"15px","fontWeight":"700","display":"flex","alignItems":"center","gap":"6px"}}>{r.name}<img src="/rider-assets/icons/users.svg" style={{"width":"14px"}} alt=""/><span style={{"fontSize":"13px","fontWeight":"500"}}>{r.seats}</span>
</div>
<div style={{"fontSize":"12px","color":"#666"}}>{r.eta}{t(" · ")}{r.note}</div>
</span>
<span style={{"fontSize":"16px","fontWeight":"700"}}>{r.price}</span>
</button>
</Fragment>)}{v.noRides&&<p role="status" style={{"margin":"8px 4px","fontSize":"14px","color":"#666"}}>{t("No cars available nearby right now")}</p>}<div style={{"display":"flex","alignItems":"center","gap":"10px","margin":"4px 2px 8px","fontSize":"14px","fontWeight":"500"}}><img src="/rider-assets/icons/wallet.svg" style={{"width":"22px"}} alt=""/>{v.payLabel}<button onClick={v.openPay} style={{"marginInlineStart":"auto","border":"0","background":"#ece8e1","borderRadius":"16px","padding":"6px 14px","fontSize":"13px","fontWeight":"700"}} type="button">{t("Change")}</button>
</div>
<button onClick={v.book} style={{"width":"100%","height":"48px","border":"0","borderRadius":"14px","background":"#111","color":"#fff","fontSize":"16px","fontWeight":"700"}} disabled={v.busy||v.noRides} type="button">{t("Choose ")}{v.selName}</button>
</div>
</div>
</>}{v.isFinding && <><div style={{"position":"absolute","insetInlineStart":"0","insetInlineEnd":"0","bottom":"0","background":"#faf8f5","borderRadius":"28px 28px 0 0","padding":"28px 24px 40px","boxShadow":"0 -6px 30px rgba(0,0,0,.12)"}} data-prototype-state="isFinding"><div style={{"height":"4px","background":"#e4dfd6","borderRadius":"2px","overflow":"hidden","marginBottom":"22px"}}><div style={{"width":v.bar,"height":"100%","background":"#111","animation":"none","transition":"width 2.4s linear"}}></div>
</div>
<div style={{"fontSize":"22px","fontWeight":"700"}}>{v.findingTitle}</div>
<div style={{"color":"#777","margin":"6px 0 20px"}}>{v.searchDescription}</div>
<button onClick={v.openCancel} style={{"width":"100%","height":"52px","borderRadius":"14px","border":"0","background":"#ece8e1","fontSize":"16px","fontWeight":"700"}} type="button">{t("Cancel")}</button>
</div>
</>}{v.isDrive && <><div style={{"position":"absolute","insetInlineStart":"0","insetInlineEnd":"0","bottom":"0","background":"#faf8f5","borderRadius":"28px 28px 0 0","padding":"20px 20px 34px","boxShadow":"0 -6px 30px rgba(0,0,0,.12)"}} data-prototype-state="isDrive" aria-label={t("Assigned vehicle")} role="region"><div style={{"display":"flex","justifyContent":"space-between","alignItems":"center"}}><div style={{"fontSize":"20px","fontWeight":"700","whiteSpace":"nowrap","overflow":"hidden","textOverflow":"ellipsis","minWidth":"0","flex":"1"}}>{v.statusTitle}</div>
<div style={{"flex":"none","marginInlineStart":"10px","whiteSpace":"nowrap","background":"#111","color":"#fff","borderRadius":"10px","padding":"6px 12px","fontWeight":"700"}}>{v.statusEta}</div>
</div>
<div style={{"display":"flex","alignItems":"center","gap":"14px","margin":"18px 0","padding":"14px","background":"#fff","borderRadius":"16px"}}><div style={{"flex":"none","width":"52px","height":"52px","borderRadius":"50%","background":"#d9d3c8","display":"flex","alignItems":"center","justifyContent":"center","fontWeight":"700","fontSize":"19px"}}>{v.driverInitials}</div>
<div style={{"flex":"1","minWidth":"0"}}><div style={{"fontSize":"17px","fontWeight":"700","whiteSpace":"nowrap","overflow":"hidden","textOverflow":"ellipsis"}}>{v.driverName}</div>
<div style={{"fontSize":"13px","color":"#666","display":"flex","alignItems":"center","gap":"4px","whiteSpace":"nowrap","marginTop":"2px"}}><img src="/rider-assets/icons/star.svg" style={{"width":"13px","flex":"none"}} alt=""/><span>{v.driverRating}{t(" · ")}{v.selName}</span>
</div>
<div style={{"display":"inline-block","marginTop":"6px","fontWeight":"700","letterSpacing":".04em","border":"2px solid #111","borderRadius":"6px","padding":"1px 7px","fontSize":"13px","whiteSpace":"nowrap"}}>{v.vehiclePlate}</div>
</div>
<div style={{"flex":"none","width":"96px","textAlign":"center"}}><img src={v.selImg} style={{"width":"96px","height":"64px","objectFit":"contain","display":"block"}} alt=""/><div style={{"fontSize":"12px","fontWeight":"700","whiteSpace":"nowrap","overflow":"hidden","textOverflow":"ellipsis"}}>{v.selModel}</div>
<div style={{"fontSize":"11px","color":"#777","whiteSpace":"nowrap","overflow":"hidden","textOverflow":"ellipsis"}}>{v.selColor}</div>
</div>
</div>
{v.isArriving && <><div style={{"display":"flex","gap":"10px"}}><button style={{"flex":"1","height":"50px","borderRadius":"14px","border":"0","background":"#ece8e1","fontWeight":"700","display":"flex","alignItems":"center","justifyContent":"center","gap":"8px"}} onClick={v.openChat} type="button"><img src="/rider-assets/icons/chat.svg" style={{"width":"20px"}} alt=""/>{t("Message")}</button>
<button style={{"width":"60px","height":"50px","borderRadius":"14px","border":"0","background":"#ece8e1","display":"flex","alignItems":"center","justifyContent":"center"}} onClick={v.callDriver} aria-label={t("Call driver")} disabled={v.noDriverPhone} type="button"><img src="/rider-assets/icons/phone.svg" style={{"width":"20px"}} alt=""/></button>
<button style={{"width":"60px","height":"50px","borderRadius":"14px","border":"0","background":"#ece8e1","display":"flex","alignItems":"center","justifyContent":"center"}} onClick={v.shareTrip} aria-label={t("Share trip details")} type="button"><img src="/rider-assets/icons/share.svg" style={{"width":"20px"}} alt=""/></button>
</div>
<button onClick={v.copyPin} style={{"width":"100%","height":"50px","marginTop":"10px","border":"0","borderRadius":"14px","background":"#111","color":"#fff","fontWeight":"700","fontSize":"16px"}} type="button">{v.pickupLabel}</button>
<button onClick={v.openCancel} style={{"width":"100%","height":"46px","marginTop":"8px","border":"0","background":"none","color":"#c0392b","fontWeight":"700","fontSize":"15px"}} type="button">{t("Cancel trip")}</button>
</>}{v.isTrip && <><div><div style={{"display":"flex","alignItems":"center","gap":"10px","fontSize":"14px","color":"#444","marginBottom":"12px"}}><img src="/rider-assets/icons/shield.svg" style={{"width":"22px"}} alt=""/>{v.sharingLabel}<button onClick={v.openSos} style={{"marginInlineStart":"auto","border":"0","background":"#c0392b","color":"#fff","fontWeight":"700","fontSize":"14px","letterSpacing":".06em","borderRadius":"20px","padding":"8px 16px"}} type="button">{t("SOS")}</button>
</div>
<button onClick={v.openChat} style={{"width":"100%","height":"50px","border":"0","borderRadius":"14px","background":"#111","color":"#fff","fontWeight":"700","fontSize":"16px"}} type="button">{t("Message")}</button>
</div>
</>}</div>
</>}{v.showSos && <><div style={{"position":"absolute","inset":"0","background":"rgba(0,0,0,.5)","zIndex":"11","display":"flex","alignItems":"flex-end"}} data-prototype-state="showSos"><div style={{"width":"100%","background":"#faf8f5","borderRadius":"28px 28px 0 0","padding":"18px 20px 30px","boxSizing":"border-box"}}><div style={{"display":"flex","justifyContent":"space-between","alignItems":"center"}}><span style={{"fontSize":"20px","fontWeight":"700"}}>{t("Emergency help")}</span>
<button onClick={v.closeSos} style={{"border":"0","background":"none","padding":"6px"}} aria-label={t("Close")} type="button"><img src="/rider-assets/icons/close.svg" style={{"width":"18px"}} alt=""/></button>
</div>
<div style={{"fontSize":"13px","color":"#777","margin":"4px 0 14px"}}>{t("Your live location and trip details can be shared with responders.")}</div>
<button onClick={v.sosCall} style={{"width":"100%","height":"58px","border":"0","borderRadius":"14px","background":"#c0392b","color":"#fff","fontSize":"17px","fontWeight":"700","display":"flex","alignItems":"center","justifyContent":"center","gap":"10px"}} type="button"><img src="/rider-assets/icons/phone.svg" style={{"width":"20px","filter":"invert(1)"}} alt=""/>{v.emergencyLabel}</button>
<button onClick={v.sosShare} style={{"width":"100%","height":"54px","marginTop":"10px","border":"0","borderRadius":"14px","background":"#ece8e1","fontSize":"16px","fontWeight":"700","display":"flex","alignItems":"center","justifyContent":"center","gap":"10px"}} type="button"><img src="/rider-assets/icons/share.svg" style={{"width":"20px"}} alt=""/>{t("Share trip details")}</button>
<button onClick={v.closeSos} style={{"width":"100%","height":"46px","marginTop":"6px","border":"0","background":"none","fontSize":"15px","fontWeight":"700"}} type="button">{t("I'm safe, close")}</button>
{v.sosMsg && <><div style={{"marginTop":"8px","padding":"10px 12px","borderRadius":"12px","background":"#f3e1c9","fontSize":"13px","fontWeight":"500"}}>{v.sosMsg}</div>
</>}</div>
</div>
</>}{v.showCancel && <><div style={{"position":"absolute","inset":"0","background":"rgba(0,0,0,.45)","zIndex":"9","display":"flex","alignItems":"flex-end"}} data-prototype-state="showCancel"><div style={{"width":"100%","background":"#faf8f5","borderRadius":"28px 28px 0 0","padding":"18px 20px 30px","boxSizing":"border-box"}}><div style={{"display":"flex","justifyContent":"space-between","alignItems":"center"}}><span style={{"fontSize":"20px","fontWeight":"700"}}>{t("Cancel trip?")}</span>
<button onClick={v.closeCancel} style={{"border":"0","background":"none","padding":"6px"}} aria-label={t("Close")} type="button"><img src="/rider-assets/icons/close.svg" style={{"width":"18px"}} alt=""/></button>
</div>
<div style={{"fontSize":"13px","color":"#777","margin":"4px 0 6px"}}>{v.cancelPolicy}</div>
{v.reasons.map((r,index)=><Fragment key={r.id || index}><button onClick={r.pick} style={{"width":"100%","display":"flex","alignItems":"center","gap":"12px","background":"none","border":"0","padding":"13px 2px","borderBottom":"1px solid #ece8e1","textAlign":"start","fontSize":"15px","fontWeight":"500"}} type="button"><span style={{"flex":"1"}}>{r.label}</span>
<span style={{"width":"22px","height":"22px","borderRadius":"50%","border":"2px solid #111","background":r.dot}}></span>
</button>
</Fragment>)}<button onClick={v.confirmCancel} style={{"width":"100%","height":"54px","marginTop":"16px","border":"0","borderRadius":"14px","background":v.cbg,"color":"#fff","fontSize":"16px","fontWeight":"700"}} disabled={v.busy} type="button">{t("Confirm cancellation")}</button>
<button onClick={v.closeCancel} style={{"width":"100%","height":"46px","marginTop":"6px","border":"0","background":"none","fontSize":"15px","fontWeight":"700"}} type="button">{t("Keep my ride")}</button>
</div>
</div>
</>}<div style={{"position":"absolute","inset":"0","zIndex":"12","pointerEvents":v.menuPE}} inert={v.menuHidden} data-prototype-menu="true"><div onClick={v.closeMenu} style={{"position":"absolute","inset":"0","background":"rgba(0,0,0,.45)","opacity":v.menuOp,"transition":"opacity .3s"}}></div>
<div style={{"position":"absolute","top":"0","bottom":"0","insetInlineStart":"0","width":"312px","background":"#faf8f5","padding":"70px 22px 28px","boxSizing":"border-box","display":"flex","flexDirection":"column","transform":"translateX(" + v.menuX + ")","transition":"transform .3s ease","boxShadow":"8px 0 30px rgba(0,0,0,.15)"}}><div style={{"display":"flex","alignItems":"center","gap":"14px"}}><div style={{"width":"64px","height":"64px","borderRadius":"50%","background":"repeating-linear-gradient(45deg,#e3dbcf 0 6px,#d9d0c2 6px 12px)","border":"3px solid #fff","display":"flex","alignItems":"center","justifyContent":"center","font":"10px ui-monospace,monospace","color":"#6b6155"}}>{v.avatar}</div>
<div><div style={{"fontSize":"22px","fontWeight":"700"}}>{v.fullName}</div>
<div style={{"display":"flex","alignItems":"center","gap":"4px","fontSize":"13px","color":"#555","marginTop":"3px","background":"#ece8e1","borderRadius":"12px","padding":"3px 9px","width":"fit-content"}}><img src="/rider-assets/icons/star.svg" style={{"width":"12px"}} alt=""/>{v.userRating}</div>
</div>
</div>
<div style={{"display":"flex","gap":"10px","margin":"22px 0 14px"}}>{v.menuTop.map((q,index)=><Fragment key={q.id || index}><button onClick={q.go} style={{"flex":"1","display":"flex","flexDirection":"column","alignItems":"center","gap":"6px","background":"#fff","border":"0","borderRadius":"14px","padding":"14px 4px","fontSize":"13px","fontWeight":"700","boxShadow":"0 2px 8px rgba(60,40,20,.07)"}} type="button"><img src={q.icon} style={{"width":"24px"}} alt=""/>{q.label}</button>
</Fragment>)}</div>
{v.menuItems.map((m,index)=><Fragment key={m.id || index}><button onClick={m.go} style={{"display":"flex","alignItems":"center","gap":"16px","background":"none","border":"0","padding":"14px 2px","fontSize":"17px","fontWeight":"500","textAlign":"start"}} type="button"><img src={m.icon} style={{"width":"22px"}} alt=""/>{m.label}</button>
</Fragment>)}<div style={{"marginTop":"auto","display":"flex","flexDirection":"column","gap":"2px"}}><div style={{"background":"#111","color":"#fff","borderRadius":"14px","padding":"14px 16px","fontSize":"14px","fontWeight":"700","marginBottom":"12px"}}>{t("Drive with Maxride")}<div style={{"fontWeight":"500","fontSize":"12px","marginTop":"2px"}}>{t("Earn on your own schedule")}</div>
</div>
<button onClick={v.signOut} style={{"border":"0","background":"none","textAlign":"start","padding":"8px 2px","fontSize":"15px","fontWeight":"700","color":"#c0392b"}} type="button">{t("Sign out")}</button>
</div>
</div>
</div>
{v.isCancelled && <><div style={{"position":"absolute","inset":"0","background":"#faf8f5","zIndex":"9","padding":"120px 24px 34px","boxSizing":"border-box","display":"flex","flexDirection":"column","alignItems":"center","textAlign":"center"}} data-prototype-state="isCancelled"><div style={{"width":"72px","height":"72px","borderRadius":"50%","background":"#ece8e1","display":"flex","alignItems":"center","justifyContent":"center"}}><img src="/rider-assets/icons/close.svg" style={{"width":"30px"}} alt=""/></div>
<div style={{"fontSize":"26px","fontWeight":"700","marginTop":"20px"}}>{t("Trip cancelled")}</div>
<div style={{"color":"#777","marginTop":"8px"}}>{t("Reason: ")}{v.reasonText}</div>
<button onClick={v.goHome} style={{"marginTop":"auto","width":"100%","height":"56px","border":"0","borderRadius":"14px","background":"#111","color":"#fff","fontSize":"17px","fontWeight":"700"}} type="button">{t("Back to home")}</button>
</div>
</>}{v.isRate && <><div style={{"position":"absolute","inset":"0","background":"#faf8f5","padding":"90px 24px 34px","boxSizing":"border-box","display":"flex","flexDirection":"column","alignItems":"center","textAlign":"center"}} data-prototype-state="isRate"><div style={{"width":"72px","height":"72px","borderRadius":"50%","background":"#111","display":"flex","alignItems":"center","justifyContent":"center"}}><img src="/rider-assets/icons/check.svg" style={{"width":"34px","filter":"invert(1)"}} alt=""/></div>
<div style={{"fontSize":"28px","fontWeight":"700","marginTop":"20px"}}>{t("You've arrived")}</div>
<div style={{"color":"#777","marginTop":"6px"}}>{v.dest}</div>
<div style={{"fontSize":"44px","fontWeight":"700","margin":"26px 0 4px"}}>{v.selPrice}</div>
<div style={{"color":"#777","fontSize":"14px"}}>{v.payLabel}{t(" · ")}{v.selName}</div>
<div style={{"marginTop":"14px","display":"inline-flex","alignItems":"center","gap":"8px","padding":"8px 16px","borderRadius":"20px","fontWeight":"700","fontSize":"14px","background":v.paidBg,"color":v.paidFg}}><img src={v.paidIcon} style={{"width":"16px","filter":v.paidFilter}} alt=""/>{v.paidText}</div>
<div style={{"marginTop":"36px","fontSize":"17px","fontWeight":"700"}}>{v.rateLabel}</div>
<div style={{"display":"flex","gap":"10px","marginTop":"14px"}}>{v.stars.map((s,index)=><Fragment key={s.id || index}><button onClick={s.set} style={{"border":"0","background":"none","padding":"4px","opacity":s.op}} aria-label={s.label} type="button"><img src="/rider-assets/icons/star.svg" style={{"width":"38px"}} alt=""/></button>
</Fragment>)}</div>
<button onClick={v.submitRating} style={{"marginTop":"auto","width":"100%","height":"56px","border":"0","borderRadius":"14px","background":"#111","color":"#fff","fontSize":"17px","fontWeight":"700"}} disabled={v.busy} type="button">{t("Done")}</button>
</div>
</>}</>; }
