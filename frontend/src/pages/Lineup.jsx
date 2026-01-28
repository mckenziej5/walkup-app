import { useEffect, useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { api } from '../api';

export default function Lineup() {
  const [players, setPlayers] = useState([]);
  const [active, setActive] = useState([]);
  const [bench, setBench] = useState([]);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    const res = await api.get('/players');
    const all = res.data;
    setPlayers(all);

    // Default: all active first load
    if (active.length === 0 && bench.length === 0) {
      setActive(all);
      setBench([]);
    }
  };

  const onDragEnd = (result) => {
    if (!result.destination) return;

    const sourceList = result.source.droppableId === 'active' ? [...active] : [...bench];
    const destList = result.destination.droppableId === 'active' ? [...active] : [...bench];

    const [moved] = sourceList.splice(result.source.index, 1);
    destList.splice(result.destination.index, 0, moved);

    if (result.source.droppableId === 'active') setActive(sourceList);
    else setBench(sourceList);

    if (result.destination.droppableId === 'active') setActive(destList);
    else setBench(destList);
  };

  const saveLineup = async () => {
    await api.post('/lineup', {
      order: active.map(p => p.id)
    });
    alert('Lineup saved');
  };

  return (
    <div className="p-6 text-white bg-gray-900 min-h-screen">
      <h1 className="text-3xl font-bold mb-6">Lineup Builder</h1>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-2 gap-6">

          {/* ACTIVE */}
          <Droppable droppableId="active">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps}
                className="bg-green-900 p-4 rounded-xl min-h-[400px]">
                <h2 className="text-xl font-bold mb-4">Active Lineup</h2>

                {active.map((p, i) => (
                  <Draggable key={p.id} draggableId={p.id} index={i}>
                    {(prov) => (
                      <div ref={prov.innerRef} {...prov.draggableProps} {...prov.dragHandleProps}
                        className="bg-green-700 p-3 mb-2 rounded-lg shadow cursor-move">
                        {i+1}. {p.name}
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>

          {/* BENCH */}
          <Droppable droppableId="bench">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps}
                className="bg-gray-800 p-4 rounded-xl min-h-[400px]">
                <h2 className="text-xl font-bold mb-4">Bench</h2>

                {bench.map((p, i) => (
                  <Draggable key={p.id} draggableId={p.id} index={i}>
                    {(prov) => (
                      <div ref={prov.innerRef} {...prov.draggableProps} {...prov.dragHandleProps}
                        className="bg-gray-700 p-3 mb-2 rounded-lg shadow cursor-move">
                        {p.name}
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>

        </div>
      </DragDropContext>

      <div className="mt-6 flex justify-center">
        <button
          onClick={saveLineup}
          className="bg-blue-500 hover:bg-blue-600 px-8 py-4 text-xl font-bold rounded-xl"
        >
          Save Lineup
        </button>
      </div>
    </div>
  );
}
