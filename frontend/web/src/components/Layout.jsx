import { Outlet } from 'react-router-dom';

import CoverBackdrop from './CoverBackdrop';
import GlobalPlayer from './GlobalPlayer';
import TopNav from './TopNav';

function Layout() {
  return (
    <div className="h-screen text-mood-text font-sans flex flex-col overflow-hidden transition-colors duration-500">
      <a href="#main-content" className="skip-link">跳到主内容</a>
      <CoverBackdrop />
      <TopNav />
      <main id="main-content" className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        <Outlet />
      </main>
      <GlobalPlayer />
    </div>
  );
}

export default Layout;
