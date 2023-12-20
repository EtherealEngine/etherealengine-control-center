// RunInDevelopment.tsx
import { Box, FormControlLabel, Switch, SxProps, Theme, Typography } from '@mui/material';
import InfoTooltip from '../../common/InfoTooltip';
import Storage from 'constants/Storage';

interface Props {
  // runDev: Record<string, string>;
  localFlags: Record<string, string>;
  onChange: (key: string, value: string) => void;
  sx?: SxProps<Theme>;
}

const RunInDevelopment = ({ localFlags, onChange, sx }: Props) => {
  return (
    <Box sx={sx}>
      <FormControlLabel
        labelPlacement="start"
        label={
          <Box sx={{ display: 'flex', alignItems: 'top', flexDirection: 'row' }}>
            <Typography variant="body2">{Storage.RUN_IN_DEVELOPMENT.replaceAll('_', ' ')}</Typography>
            <InfoTooltip message="Toggle to run in development mode." />
          </Box>
        }
        sx={{ marginTop: 1, marginLeft: 0 }}
        control={<Switch checked={localFlags[Storage.RUN_IN_DEVELOPMENT] === 'true'} sx={{ marginLeft: 4 }} />}
        value={localFlags[Storage.RUN_IN_DEVELOPMENT] === 'true'}
        // onChange={(_event, checked) => onChange(Storage.RUN_IN_DEVELOPMENT, checked ? 'true' : 'false')}
        onChange={(_event, checked) => {
            onChange(Storage.RUN_IN_DEVELOPMENT, checked ? 'true' : 'false')
            if (checked) {
                console.log(true)
                console.log(Storage.RUN_IN_DEVELOPMENT)
              console.log(localFlags[Storage.RUN_IN_DEVELOPMENT])
            }
            else {
                console.log(false)
                console.log(Storage.RUN_IN_DEVELOPMENT)
              console.log(localFlags[Storage.RUN_IN_DEVELOPMENT])
            }
        }}
      />
    </Box>
  );
};

export default RunInDevelopment;
