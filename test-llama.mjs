import { getLlama, LlamaChatSession } from 'node-llama-cpp';

console.log('A: imported');
try {
  const runtime = await getLlama({ gpu: 'disabled' });
  console.log('B: runtime ready');
  const modelPath = String.raw`C:\Users\Pawan Singhal\.vscode-rotator\models\Phi-3-mini-4k-instruct-q4.gguf`;
  const model = await runtime.loadModel({ modelPath });
  console.log('C: model loaded');
  const context = await model.createContext({ contextSize: 512 });
  console.log('D: context created');
  const session = new LlamaChatSession({ contextSequence: context.getSequence() });
  console.log('E: session created');
  const res = await session.prompt('Say hi.');
  console.log('F: response:', res);
} catch(e) {
  console.error('ERROR at step:', e.message);
}
