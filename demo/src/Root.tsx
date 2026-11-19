import { Composition } from 'remotion'
import { Demo, SCENES, Social, totalFrames } from './Demo'

export const Root = () => (
  <>
    <Composition id="Demo" component={Demo} durationInFrames={totalFrames(SCENES)} fps={30} width={1920} height={1080} />
    <Composition id="Social" component={Social} durationInFrames={1} fps={30} width={1280} height={640} />
  </>
)
