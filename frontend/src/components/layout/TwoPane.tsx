import { LeftPane } from './LeftPane';
import { RightPane } from './RightPane';

export function TwoPane() {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <LeftPane />
      <RightPane />
    </div>
  );
}
