export interface SitePlanCalibration {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface SitePlanState {
  imageUrl: string | null;
  imageWidth: number;
  imageHeight: number;
  calibration: SitePlanCalibration | null;
  opacity: number;
  visible: boolean;
  hasSegmentation: boolean;
  segmentationSummary: string | null;
}

export const emptySitePlanState = (): SitePlanState => ({
  imageUrl: null,
  imageWidth: 0,
  imageHeight: 0,
  calibration: null,
  opacity: 0.7,
  visible: true,
  hasSegmentation: false,
  segmentationSummary: null,
});
