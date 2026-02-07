# Particle Interaction Diagrams

## Particle Categories

```mermaid
graph TB
    subgraph Basics["Basic Elements"]
        Sand[Sand]
        Water[Water]
        Dirt[Dirt]
        Stone[Stone]
        Glass[Glass]
    end

    subgraph Organic["Organic Matter"]
        Plant[Plant]
        Flower[Flower]
        Fluff[Fluff]
        Honey[Honey]
    end

    subgraph Creatures["Living Creatures"]
        Bug[Bug]
        Ant[Ant]
        Bird[Bird]
        Bee[Bee]
        Slime[Slime]
    end

    subgraph Energy["Energy & Fire"]
        Fire[Fire]
        Plasma[Plasma]
        Lightning[Lightning]
        Ember[Ember]
        Static[Static]
    end

    subgraph Explosives["Explosives"]
        Nitro[Nitro]
        Gunpowder[Gunpowder]
    end

    subgraph Spawners["Spawner Blocks"]
        Tap[Tap]
        Anthill[Anthill]
        Hive[Hive]
        Nest[Nest]
        Gun[Gun]
    end

    subgraph Special["Special"]
        Gas[Gas]
        Crystal[Crystal]
        Alien[Alien]
        Quark[Quark]
        Bullet[Bullet]
    end
```

## Fire Spread Network

```mermaid
flowchart LR
    Fire((Fire)) -->|ignites| Plant
    Fire -->|ignites| Fluff
    Fire -->|ignites| Bug
    Fire -->|ignites| Gas
    Fire -->|ignites| Gunpowder
    Fire -->|ignites| Flower
    Fire -->|ignites| Hive
    Fire -->|ignites| Nest

    Lightning -->|creates| Fire
    Ember -->|reignites| Plant
    Ember -->|reignites| Fluff
    Gunpowder -->|explodes to| Fire

    Fire -->|decays to| Gas
    Fire -->|decays to| Ember
    Fire -->|decays to| Empty[Empty]
```

## Creature Food Chain

```mermaid
flowchart TD
    subgraph Predators
        Bird[Bird]
    end

    subgraph Prey
        Ant[Ant]
        Bug[Bug]
        Bee[Bee]
    end

    subgraph Food
        Dirt[Dirt]
        Plant[Plant]
        Honey[Honey]
        Fluff[Fluff]
        Sand[Sand]
        Slime[Slime]
        Nitro[Nitro]
    end

    Bird -->|eats, spawns bird| Ant
    Bird -->|eats, spawns bird| Bug
    Bird -->|eats, spawns bird| Bee

    Ant -->|eats| Dirt
    Ant -->|eats| Plant
    Ant -->|eats| Sand
    Ant -->|eats| Bug
    Ant -->|eats| Slime
    Ant -->|eats| Honey
    Ant -->|eats| Nitro
    Ant -->|multiplies from| Fluff

    Bug -->|eats| Dirt
    Bug -->|eats| Plant
    Bug -->|eats| Honey
    Bug -->|multiplies from| Fluff

    Slime -->|eats| Dirt
    Slime -->|eats| Sand
    Slime -->|eats| Bug
```

## Spawner Relationships

```mermaid
flowchart LR
    Tap[Tap] -->|spawns| Water[Water]
    Anthill[Anthill] -->|spawns| Ant[Ant]
    Hive[Hive] -->|spawns| Bee[Bee]
    Nest[Nest] -->|spawns| Bird[Bird]
    Gun[Gun] -->|spawns| Bullet[Bullet]

    Fire[Fire] -.->|destroys| Anthill
    Fire -.->|destroys| Hive
    Fire -.->|destroys| Nest
```

## Bee Ecosystem

```mermaid
flowchart LR
    Bee[Bee] -->|pollinates| Plant[Plant]
    Plant -->|becomes| Flower[Flower]
    Bee -->|harvests| Flower
    Flower -->|produces| Honey[Honey]

    Bird[Bird] -->|eats| Bee
    Fire[Fire] -->|burns| Flower
    Fire -->|burns| Hive[Hive]

    Hive -->|spawns| Bee
```

## Alien Terraforming

```mermaid
flowchart TD
    Alien((Alien))

    Sand[Sand] -->|Alien transforms| Glass[Glass]
    Sand -->|Alien transforms| Plant[Plant]

    Dirt[Dirt] -->|Alien transforms| Plant
    Dirt -->|Alien transforms| Water[Water]

    Water -->|Alien transforms| Slime[Slime]
    Water -->|Alien transforms| Plant

    Plant -->|Alien transforms| Bug[Bug]

    Glass -->|Alien transforms| Fluff[Fluff]

    Alien -->|duplicates| Alien
    Alien -->|emits| Water
    Alien -->|emits| Plant
    Alien -->|emits| Slime
```

## Quark Chaos

```mermaid
flowchart TD
    Quark((Quark))

    Plant[Plant] -->|Quark transforms| Sand[Sand]
    Plant -->|Quark transforms| Stone[Stone]
    Plant -->|Quark transforms| Ember[Ember]

    Water[Water] -->|Quark transforms| Static[Static]
    Water -->|Quark transforms| Lightning[Lightning]

    Glass[Glass] -->|Quark transforms| Crystal[Crystal]

    Sand -->|Quark transforms| Stone
    Sand -->|Quark transforms| Lightning

    Slime[Slime] -->|Quark transforms| Ember
    Slime -->|Quark transforms| Plasma[Plasma]

    Quark -->|shoots| Lightning
    Quark -->|shoots| Static
    Quark -->|shoots| Ember
    Quark -->|shoots| Plasma
```

## Explosion Chains

```mermaid
flowchart LR
    subgraph Triggers
        Fire[Fire]
        Plasma[Plasma]
        Lightning[Lightning]
        Ember[Ember]
        Bullet[Bullet]
    end

    subgraph Explosives
        Gunpowder[Gunpowder]
        Nitro[Nitro]
    end

    Fire -->|ignites| Gunpowder
    Plasma -->|ignites| Gunpowder
    Lightning -->|ignites| Gunpowder
    Ember -->|ignites| Gunpowder
    Bullet -->|ignites| Gunpowder
    Bullet -->|ignites| Nitro

    Gunpowder -->|chain reaction| Gunpowder
    Gunpowder -->|explosion radius 12| Destruction[Destroys Stone]

    Nitro -->|explosion radius 8| Destruction2[Destroys Most]
    Nitro -->|water becomes| Stone[Stone]
```

## Bullet Interactions

```mermaid
flowchart LR
    Gun[Gun] -->|shoots| Bullet[Bullet]

    Bullet -->|ignites| Gunpowder[Gunpowder]
    Bullet -->|ignites| Nitro[Nitro]
    Bullet -.->|passes through| Plant[Plant]
    Bullet -.->|passes through| Gun
    Bullet -->|destroys| Everything[All Other Particles]
```

## Lightning Effects

```mermaid
flowchart TD
    Lightning((Lightning))

    Lightning -->|strikes| Sand[Sand]
    Sand -->|becomes| Glass[Glass]

    Lightning -->|strikes| Water[Water]
    Water -->|spreads| Lightning

    Lightning -->|strikes| Plant[Plant]
    Plant -->|becomes| Fire[Fire]

    Lightning -->|strikes| Nitro[Nitro]
    Nitro -->|explodes| Explosion[Massive Explosion]

    Lightning -->|decays to| Static[Static]
    Static -->|can spark| Lightning
```

## Material Density (Sinking Behavior)

```mermaid
flowchart TB
    subgraph Heavy["Heavy (Sinks)"]
        Stone[Stone - 5]
        Glass[Glass - 5]
    end

    subgraph Medium["Medium"]
        Sand[Sand - 3]
        Dirt[Dirt - 3]
        Gunpowder[Gunpowder - 3]
    end

    subgraph Light["Light"]
        Nitro[Nitro - 2]
        Honey[Honey - 2]
    end

    subgraph Liquid["Liquid Base"]
        Water[Water - 1]
    end

    Stone --> Sand --> Nitro --> Water
    Glass --> Dirt --> Honey --> Water
    Gunpowder --> Water
```

## Complete Interaction Matrix

```mermaid
graph TB
    subgraph Legend
        L1[Solid Arrow = Transforms/Creates]
        L2[Dashed Arrow = Destroys/Removes]
        L3[Dotted Arrow = Passes Through]
    end
```

### Key Interactions Summary:
- **Fire spreads to:** Plant, Fluff, Bug, Gas, Gunpowder, Flower, Hive, Nest
- **Lightning transforms:** Sand→Glass, ignites flammables, spreads in water
- **Alien creates:** Plant, Bug, Slime, Fluff, Water (organic focus)
- **Quark creates:** Stone, Glass, Crystal, Lightning, Static, Ember (inorganic focus)
- **Bullets:** Destroy most things, ignite explosives, pass through plants
- **Creatures eat:** Various materials, multiply from Fluff
