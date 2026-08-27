type BrandLockupProps = {
  sectionTitle:string;
  sectionSubtitle:string;
};

export function BrandLockup({ sectionTitle, sectionSubtitle }:BrandLockupProps) {
  return <div className="brand-lockup">
    <h1 aria-label="Sword Art Online">
      <span className="brand-plane" aria-hidden="true">
        <span className="brand-edition">2DIMENSIONALM · DAILY OPERATIONS</span>
        <span className="logo-face logo-primary" data-text="SWORD ART">SWORD ART</span>
        <strong className="logo-face logo-secondary" data-text="ONLINE">ONLINE</strong>
        <span className="brand-index">04</span>
        <i className="brand-spark">✦</i>
      </span>
    </h1>
    <p>{sectionTitle} / {sectionSubtitle}</p>
  </div>;
}
