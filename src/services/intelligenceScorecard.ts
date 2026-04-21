import { gradeScore, type IntelligenceGrade } from './grade.js';

export interface IntelligenceInputs {
  reasoning: number;
  dataAnalysis: number;
  deepThinking: number;
  intelligence: number;
  strongBrain: number;
}

export interface SmartInputs {
  sharpness: number;
  shrewdness: number;
  astuteness: number;
  quickWitted: number;
  resourcefulness: number;
}

export interface AutonomousInputs {
  selfDirection: number;
  selfCritique: number;
  introspection: number;
  initiative: number;
  adaptability: number;
}

export interface IntelligenceScorecard {
  intelligent: number;
  smart: number;
  autonomous: number;
  composite: number;
  grades: {
    intelligent: IntelligenceGrade;
    smart: IntelligenceGrade;
    autonomous: IntelligenceGrade;
    composite: IntelligenceGrade;
  };
}

const avg = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.max(0, Math.min(100, sum / values.length));
};

export function buildIntelligenceScorecard(
  intelligence: IntelligenceInputs,
  smart: SmartInputs,
  autonomous: AutonomousInputs,
): IntelligenceScorecard {
  const iScore = avg([
    intelligence.reasoning,
    intelligence.dataAnalysis,
    intelligence.deepThinking,
    intelligence.intelligence,
    intelligence.strongBrain,
  ]);
  const sScore = avg([
    smart.sharpness,
    smart.shrewdness,
    smart.astuteness,
    smart.quickWitted,
    smart.resourcefulness,
  ]);
  const aScore = avg([
    autonomous.selfDirection,
    autonomous.selfCritique,
    autonomous.introspection,
    autonomous.initiative,
    autonomous.adaptability,
  ]);
  const composite = avg([iScore, sScore, aScore]);
  return {
    intelligent: iScore,
    smart: sScore,
    autonomous: aScore,
    composite,
    grades: {
      intelligent: gradeScore(iScore),
      smart: gradeScore(sScore),
      autonomous: gradeScore(aScore),
      composite: gradeScore(composite),
    },
  };
}

export function buildMaxActiveInputs(): {
  intelligence: IntelligenceInputs;
  smart: SmartInputs;
  autonomous: AutonomousInputs;
} {
  const max = 100;
  return {
    intelligence: {
      reasoning: max,
      dataAnalysis: max,
      deepThinking: max,
      intelligence: max,
      strongBrain: max,
    },
    smart: {
      sharpness: max,
      shrewdness: max,
      astuteness: max,
      quickWitted: max,
      resourcefulness: max,
    },
    autonomous: {
      selfDirection: max,
      selfCritique: max,
      introspection: max,
      initiative: max,
      adaptability: max,
    },
  };
}
