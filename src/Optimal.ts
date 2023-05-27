import {State} from "./LZMADecoder";

export class Optimal {
  State: State
  Prev1IsChar: boolean
  Prev2: boolean

  PosPrev2: number
  BackPrev2: number

  Price: number
  PosPrev: number
  BackPrev: number

  Backs0: number
  Backs1: number
  Backs2: number
  Backs3: number

  MakeAsChar: () => void = () => {
    this.BackPrev = -1;
    this.Prev1IsChar = false;
  }

  MakeAsShortRep: () => void = () => {
    this.BackPrev = 0;
    this.Prev1IsChar = false;
  }

  IsShortRep: () => boolean = () => {
    return this.BackPrev === 0;
  }
}