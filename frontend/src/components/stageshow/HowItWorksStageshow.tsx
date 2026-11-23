import { CheckIcon, LockIcon, ShuffleIcon } from '../Icons';
import {
  Avatar,
  Badge,
  Bar,
  Button,
  Roll,
  Row,
  Stage,
  Text,
  Window,
  type Act,
} from './index';
import './ajofunStage.css';

type DemoState = {
  drawn: boolean;
  matchCard: boolean;
  unsealed: boolean;
};

const INITIAL: DemoState = {
  drawn: false,
  matchCard: false,
  unsealed: false,
};

const POSTER: DemoState = {
  drawn: true,
  matchCard: true,
  unsealed: true,
};

const REST = {
  wide: { x: 432, y: 294 },
  compact: { x: 288, y: 248 },
};

async function runWalkthrough(a: Act<DemoState>) {
  a.mark('roster');
  await a.wait(850);

  a.mark('draw');
  await a.move('draw-btn');
  await a.wait(220);
  await a.click();
  await a.set({ drawn: true });
  await a.wait(550);

  await a.set({ matchCard: true });
  await a.wait(450);

  a.mark('unseal');
  await a.move('unseal-btn');
  await a.wait(220);
  await a.click();
  await a.set({ unsealed: true });

  a.mark('poster');
  await a.move('rest');
  await a.wait(3200);

  await a.set({ matchCard: false });
  await a.wait(260);
  await a.set(INITIAL);
  await a.wait(450);
}

const PARTICIPANTS = [
  { name: 'Alex Rivera', note: 'Whole bean espresso · Host' },
  { name: 'Jordan Lee', note: 'Ceramic pour-over dripper' },
  { name: 'Sam Patel', note: 'Cardamom chai · Novella' },
];

export function HowItWorksStageshow() {
  return (
    <figure className="space-y-2.5">
      <div aria-hidden="true" className="w-full overflow-hidden">
        <Stage
          width={500}
          height={348}
          compact={{ below: 420, width: 328, height: 292 }}
          initial={INITIAL}
          poster={POSTER}
          script={runWalkthrough}
          cursor={{ at: REST, ripple: true }}
          className="look-ajofun"
        >
          {(s, _rect, layout) => (
            <>
              <Window
                url="ajofun.app/exchanges"
                lights="grey"
                className="aj-window"
                receded={s.matchCard}
              >
                <div className="aj-window-body">
                  <div className="aj-header">
                    <div className="aj-title-group">
                      <div className="aj-title">Studio Holiday Swap</div>
                      <div className="aj-meta">
                        <Badge
                          tone={s.drawn ? 'danger' : 'success'}
                          dot={!s.drawn}
                        >
                          <Roll>{s.drawn ? 'Names drawn' : 'Open'}</Roll>
                        </Badge>
                        <span className="aj-meta-text">4 of 4 joined</span>
                      </div>
                    </div>

                    <Button
                      data-target="draw-btn"
                      variant={s.drawn ? 'secondary' : 'danger'}
                      size={layout === 'compact' ? 'small' : 'medium'}
                      icon={
                        s.drawn ? (
                          <CheckIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <ShuffleIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        )
                      }
                    >
                      {s.drawn ? 'Drawn' : 'Draw names'}
                    </Button>
                  </div>

                  <div className="aj-roster">
                    {PARTICIPANTS.slice(0, layout === 'compact' ? 2 : 3).map((person) => (
                      <Row
                        key={person.name}
                        pad={layout === 'compact' ? 9 : 10}
                        lead={<Avatar name={person.name} size={26} />}
                        title={<Text>{person.name}</Text>}
                        subtitle={<Text filler>{person.note}</Text>}
                        meta={<Bar w={42} h={6} tone={2} />}
                      />
                    ))}
                    <Row
                      pad={layout === 'compact' ? 9 : 10}
                      lead={<Avatar plain size={26} />}
                      title={<Bar w={92} h={6} tone={3} />}
                      subtitle={<Bar w={136} h={5} tone={1} />}
                    />
                  </div>
                </div>
              </Window>

              <div className="aj-satellite" data-show={s.matchCard}>
                {s.unsealed && (
                  <div className="aj-sat-bar">
                    <div className="aj-sat-bar-fill" />
                  </div>
                )}
                <div className="aj-sat-inner">
                  <div className="aj-sat-head">
                    <span className="aj-sat-eyebrow">Your Secret Match</span>
                    <Badge tone={s.unsealed ? 'success' : 'danger'}>
                      {s.unsealed ? '10s peek' : 'Sealed'}
                    </Badge>
                  </div>

                  {s.unsealed ? (
                    <>
                      <div className="aj-sat-name">Sam Patel</div>
                      <div className="aj-sat-wish">
                        <span className="aj-sat-wish-title">Cozy sci-fi novella</span>
                        <span className="aj-sat-wish-note">
                          No tree nuts · Leave under cabin tree
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="aj-sat-sealed">
                      <span className="aj-sat-sealed-copy">
                        Hidden until you break the seal.
                      </span>
                      <Button
                        data-target="unseal-btn"
                        variant="danger"
                        size="small"
                        icon={<LockIcon className="h-3 w-3" aria-hidden="true" />}
                      >
                        Unseal
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <span
                data-target="rest"
                style={{
                  position: 'absolute',
                  left: REST[layout].x,
                  top: REST[layout].y,
                }}
              />
            </>
          )}
        </Stage>
      </div>
      <figcaption className="text-xs leading-relaxed text-ink-muted">
        Blind server draw &middot; 10-second private reveal &middot; Anonymous Q&amp;A
      </figcaption>
    </figure>
  );
}
