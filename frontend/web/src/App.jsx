import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import Layout from './components/Layout';
import { AppStateProvider } from './contexts/AppStateContext';
import ChatPage from './pages/ChatPage';
import CommunityPage from './pages/CommunityPage';
import JournalPage from './pages/JournalPage';
import LibraryPage from './pages/LibraryPage';
import MoodPage from './pages/MoodPage';
import RadioPage from './pages/RadioPage';
import SettingsPage from './pages/SettingsPage';
import UploadPage from './pages/UploadPage';

function App() {
  return (
    <AppStateProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout/>}>
            <Route index element={<Navigate to="/radio" replace/>}/>
            <Route path="/radio" element={<RadioPage/>}/>
            <Route path="/chat" element={<ChatPage/>}/>
            <Route path="/library" element={<LibraryPage/>}/>
            <Route path="/upload" element={<UploadPage/>}/>
            <Route path="/mood" element={<MoodPage/>}/>
            <Route path="/journal" element={<JournalPage/>}/>
            <Route path="/community" element={<CommunityPage/>}/>
            <Route path="/settings" element={<SettingsPage/>}/>
            <Route path="*" element={<Navigate to="/radio" replace/>}/>
          </Route>
        </Routes>
      </BrowserRouter>
    </AppStateProvider>
  );
}

export default App;
