import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../theme.js';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  focus: boolean;
}

export function InputBox({ value, onChange, onSubmit, focus }: Props): React.ReactElement {
  const theme = useTheme();
  return (
    <Box borderStyle="single" borderColor={theme.inputBorder} paddingX={1}>
      <Text color={theme.inputChevron}>▸ </Text>
      <TextInput value={value} onChange={onChange} onSubmit={onSubmit} focus={focus} />
    </Box>
  );
}
