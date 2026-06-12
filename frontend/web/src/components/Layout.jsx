import { Outlet } from 'react-router-dom';

import TopNav from './TopNav';

function Layout() {
  return (
    <div className="h-screen bg-mood-bg text-mood-text font-sans flex flex-col overflow-hidden transition-colors duration-300">
      <TopNav />
      <main className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
