import './App.css';

import ClientUI from './lib/client-ui';


function App() {
  return (
    <div className="App" style={{margin: 20, textAlign: 'center'}}>
      <h1> Audio To Text Demo </h1>
      <hr/>
      <ClientUI/>
    </div>
  );
}

export default App;

