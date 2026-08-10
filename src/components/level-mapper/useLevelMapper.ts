import * as React from 'react';
import { LevelMapperContext } from './LevelMapperStore';

export const useLevelMapper = () => {
  const ctx = React.useContext(LevelMapperContext);
  if (!ctx) throw new Error('useLevelMapper must be used inside LevelMapperProvider');
  return ctx;
};
