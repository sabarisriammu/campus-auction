
import { useState } from "react";

function App() {
  const [message, setMessage] = useState("Not connected yet");

  async function testBackend() {
    try {
      const response = await fetch("http://localhost:5000/");
      const data = await response.json();

      setMessage(data.message);
    } catch (error) {
      setMessage("Backend connection failed!");
      console.error(error);
    }
  }

  return (
    <div style={{ padding: "30px", fontFamily: "Arial" }}>
      <h1>Campus Auction</h1>
      <p>Frontend: React is running!</p>

      <button onClick={testBackend}>
        Test Backend Connection
      </button>

      <p>Backend response: {message}</p>
    </div>
  );
}

export default App;
