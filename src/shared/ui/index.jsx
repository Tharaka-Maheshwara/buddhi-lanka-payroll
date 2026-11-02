export function Button({children,secondary=false,...props}){return <button className={secondary?'button-secondary':'button'} {...props}>{children}</button>}
export function Field({label,children}){return <label className="flex flex-col gap-2 text-sm text-stone-600"><span>{label}</span>{children}</label>}
export function PageHeader({title,description,action}){return <div className="mb-7 flex flex-wrap items-start justify-between gap-4"><div><div className="eyebrow">BUDDHI LANKA ENGINEERS</div><h1>{title}</h1><p>{description}</p></div>{action}</div>}
export function Stat({label,value}){return <div className="card"><p className="text-xs">{label}</p><div className="my-3 text-2xl font-semibold">{value}</div></div>}
export function Message({children}){return <div role="status" className="notice">{children}</div>}
