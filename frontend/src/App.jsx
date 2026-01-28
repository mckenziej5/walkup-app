import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import GameMode from './pages/GameMode';
import Players from './pages/Players';
import Lineup from './pages/Lineup';

export default function App(){
  return (
    <BrowserRouter>
      <nav className="bg-gray-900 text-white p-4 flex gap-6 text-lg">
        <Link to="/">Game</Link>
        <Link to="/players">Players</Link>
        <Link to="/lineup">Lineup</Link>
      </nav>

      <Routes>
        <Route path="/" element={<GameMode/>}/>
        <Route path="/players" element={<Players/>}/>
        <Route path="/lineup" element={<Lineup/>}/>
      </Routes>
    </BrowserRouter>
  );
}
