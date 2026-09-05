import { Icon } from "tdesign-icons-react";

export interface MobileNavItem {
  readonly icon: string;
  readonly label: string;
}

export function MobileShell({
  active,
  children,
  navItems,
}: {
  readonly active: string;
  readonly children: React.ReactNode;
  readonly navItems: readonly MobileNavItem[];
}): React.JSX.Element {
  return (
    <div className="mobile-preview-page">
      <main className="mobile-content">{children}</main>
      <nav className="mobile-bottom-nav" aria-label="移动端主要导航">
        {navItems.map((item) => (
          <button type="button" className={item.label === active ? "active" : ""} key={item.label}>
            <Icon name={item.icon} size="27px" />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

export function MobileTopbar({
  account,
  title,
}: {
  readonly account: string;
  readonly title: string;
}): React.JSX.Element {
  return (
    <header className="mobile-topbar">
      <div>
        <p>{account}</p>
        <h1>{title}</h1>
      </div>
      <button type="button" aria-label="更多操作">
        <Icon name="ellipsis" size="25px" />
      </button>
    </header>
  );
}
