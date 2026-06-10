import zoomPlugin from 'chartjs-plugin-zoom';
import annotationPlugin from 'chartjs-plugin-annotation';

import { Scatter } from 'react-chartjs-2';
import { memo, useEffect, useMemo, useRef } from 'react';
import {
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Title,
  Tooltip
} from 'chart.js';

// 注册插件
ChartJS.register(LinearScale, PointElement, LineElement, LineController, Tooltip, Legend, Title, annotationPlugin, zoomPlugin);

const MoodChart = memo(function MoodChart({
  tracks,
  selectedTrack,
  trajectory,
  playlistRadius,
  playlistItems,
  currentTime,
  onPointClick,
  isDark
}) {
  const chartRef = useRef(null);
  const dataRef = useRef({ tracks, playlistItems, selectedTrack, trajectory, onPointClick });

  useEffect(() => {
    dataRef.current = { tracks, playlistItems, selectedTrack, trajectory, onPointClick };
  }, [tracks, playlistItems, selectedTrack, trajectory, onPointClick]);

  // 1. 样式定义
  const colors = useMemo(() => ({
    happy: isDark ? 'rgba(255, 200, 0, 0.08)' : 'rgba(255, 200, 0, 0.15)',
    angry: isDark ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.15)',
    sad: isDark ? 'rgba(59, 130, 246, 0.08)' : 'rgba(59, 130, 246, 0.15)',
    calm: isDark ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.15)',
    grid: isDark ? '#334155' : '#e2e8f0',
    text: isDark ? '#94a3b8' : '#64748b'
  }), [isDark]);

  // 2. 动态配置 (Options)
  const chartOptions = useMemo(() => {
    // 动态生成圆圈配置
    let circleAnnotation = {};
    const currentSelected = dataRef.current.selectedTrack;

    // 仅当 selectedTrack ID 变化时 options 才会重建
    if (selectedTrack && selectedTrack.v != null && selectedTrack.a != null) {
      const v = Number.parseFloat(selectedTrack.v);
      const a = Number.parseFloat(selectedTrack.a);
      const r = Number.parseFloat(playlistRadius);

      if (!Number.isNaN(v) && !Number.isNaN(a) && !Number.isNaN(r)) {
        circleAnnotation = {
          playlistCircle: {
            type: 'ellipse',
            xScaleID: 'x',
            yScaleID: 'y',
            drawTime: 'afterDatasetsDraw',
            xMin: v - r,
            xMax: v + r,
            yMin: a - r,
            yMax: a + r,
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
            borderColor: isDark ? 'rgba(16, 185, 129, 0.8)' : 'rgba(16, 185, 129, 1)',
            borderWidth: 2,
            borderDash: [6, 4]
          }
        };
      }
    }

    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: {
          min: 0, max: 10,
          grid: { color: colors.grid },
          title: {
            display: true,
            text: '愉悦度 Valence (悲伤 ◄──► 快乐)',
            color: colors.text,
            font: { size: 11, weight: 'bold' }
          },
          ticks: { color: colors.text, font: { size: 10 } }
        },
        y: {
          min: 0, max: 10,
          grid: { color: colors.grid },
          title: {
            display: true,
            text: '能量值 Arousal (平静 ◄──► 激动)',
            color: colors.text,
            font: { size: 11, weight: 'bold' }
          },
          ticks: { color: colors.text, font: { size: 10 } }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
          titleColor: isDark ? '#fff' : '#0f172a',
          bodyColor: isDark ? '#cbd5e1' : '#334155',
          borderColor: colors.grid,
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label(ctx) {
              // 通过 Ref 读取最新数据
              const currentData = dataRef.current;

              if (ctx.dataset.label === 'Music Library') {
                const track = currentData.tracks[ctx.dataIndex];
                return track ? track.title : '';
              }
              if (ctx.dataset.label === 'Playlist') {
                const track = currentData.playlistItems[ctx.dataIndex];
                return track ? track.title : '';
              }
              if (ctx.dataset.label === 'Current Track')
                return currentData.selectedTrack?.title || '';

              if (ctx.dataset.label === 'Trajectory') {
                const point = currentData.trajectory[ctx.dataIndex];
                return point ? `T: ${point.t.toFixed(1)}s` : '';
              }
              return '';
            }
          }
        },
        annotation: {
          common: { drawTime: 'beforeDatasetsDraw' },
          annotations: {
            q1: {
              type: 'box',
              xScaleID: 'x',
              yScaleID: 'y',
              xMin: 5,
              xMax: 10,
              yMin: 5,
              yMax: 10,
              backgroundColor: colors.happy,
              borderWidth: 0
            },
            q2: {
              type: 'box',
              xScaleID: 'x',
              yScaleID: 'y',
              xMin: 0,
              xMax: 5,
              yMin: 5,
              yMax: 10,
              backgroundColor: colors.angry,
              borderWidth: 0
            },
            q3: {
              type: 'box',
              xScaleID: 'x',
              yScaleID: 'y',
              xMin: 0,
              xMax: 5,
              yMin: 0,
              yMax: 5,
              backgroundColor: colors.sad,
              borderWidth: 0
            },
            q4: {
              type: 'box',
              xScaleID: 'x',
              yScaleID: 'y',
              xMin: 5,
              xMax: 10,
              yMin: 0,
              yMax: 5,
              backgroundColor: colors.calm,
              borderWidth: 0
            },
            ...circleAnnotation
          }
        },
        zoom: {
          pan: { enabled: true, mode: 'xy', threshold: 10 },
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            mode: 'xy'
          },
          limits: {
            x: { min: 0, max: 10, minRange: 1 },
            y: { min: 0, max: 10, minRange: 1 }
          }
        }
      },
      onClick(e, elements) {
        if (elements.length > 0) {
          const el = elements[0];
          const dsIndex = el.datasetIndex;
          const idx = el.index;
          const chart = e.chart;
          const label = chart.data.datasets[dsIndex].label;

          const {
            onPointClick: latestOnPointClick,
            tracks: latestTracks,
            playlistItems: latestPlaylist
          } = dataRef.current;

          if (label === 'Music Library') {
            latestOnPointClick(idx);
          } else if (label === 'Playlist') {
            const clickedItem = latestPlaylist[idx];
            if (clickedItem) {
              const originalIndex = latestTracks.findIndex(t => t.id === clickedItem.id);
              if (originalIndex !== -1)
                latestOnPointClick(originalIndex);
            }
          }
        }
      }
    };
  }, [colors, isDark, playlistRadius, selectedTrack?.id, selectedTrack?.v, selectedTrack?.a]);

  // 3. 数据集构建
  const chartData = useMemo(() => {
    return {
      datasets: [
        {
          type: 'scatter',
          label: 'Music Library',
          data: tracks.map(t => ({ x: t.v, y: t.a })),
          backgroundColor(ctx) {
            const val = ctx.raw?.y || 5;
            return val > 5 ? 'rgba(244, 63, 94, 0.5)' : 'rgba(99, 102, 241, 0.5)';
          },
          pointRadius: 4,
          pointHoverRadius: 7,
          order: 10
        },
        ...(selectedTrack && trajectory && trajectory.length > 0
          ? [{
            type: 'line',
            label: 'Trajectory',
            data: trajectory.map(p => ({ x: p.v, y: p.a })),
            borderColor: isDark ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.4)',
            borderWidth: 2,
            pointRadius: 0,
            fill: false,
            tension: 0.2,
            order: 5
          }]
          : []),
        {
          type: 'scatter',
          label: 'Now Playing',
          data: [],
          pointStyle: 'crossRot',
          borderColor: isDark ? '#fff' : '#000',
          borderWidth: 3,
          pointRadius: 10,
          backgroundColor: isDark ? '#fff' : '#000',
          order: 1
        },
        ...(playlistItems && playlistItems.length > 0
          ? [{
            type: 'scatter',
            label: 'Playlist',
            data: playlistItems.map(t => ({ x: t.v, y: t.a })),
            backgroundColor: '#fbbf24',
            borderColor: '#f59e0b',
            borderWidth: 1,
            pointRadius: 5,
            pointHoverRadius: 8,
            order: 2
          }]
          : []),
        ...(selectedTrack
          ? [{
            type: 'scatter',
            label: 'Current Track',
            data: [{ x: selectedTrack.v, y: selectedTrack.a }],
            backgroundColor: isDark ? '#fff' : '#000',
            pointRadius: 6,
            pointBorderColor: isDark ? '#000' : '#fff',
            pointBorderWidth: 2,
            order: 3
          }]
          : [])
      ]
    };
  }, [tracks, selectedTrack, trajectory, playlistItems, isDark]);

  // 4. 播放进度动画 (Imperative Update)
  useEffect(() => {
    if (document.hidden) return;

    const chart = chartRef.current;
    if (!chart) return;

    const traj = dataRef.current.trajectory;
    const nowPlayingDataset = chart.data.datasets.find(d => d.label === 'Now Playing');

    if (!nowPlayingDataset) return;

    let point = null;

    if (traj && traj.length > 0 && currentTime !== undefined) {
      for (let i = 0; i < traj.length - 1; i++) {
        const p1 = traj[i];
        const p2 = traj[i + 1];
        if (currentTime >= p1.t && currentTime <= p2.t) {
          const ratio = (currentTime - p1.t) / (p2.t - p1.t);
          point = {
            x: p1.v + (p2.v - p1.v) * ratio,
            y: p1.a + (p2.a - p1.a) * ratio
          };
          break;
        }
      }
      if (!point) {
        if (currentTime < traj[0].t) {
          point = { x: traj[0].v, y: traj[0].a };
        } else if (currentTime > traj[traj.length - 1].t) {
          const last = traj[traj.length - 1];
          point = { x: last.v, y: last.a };
        }
      }
    }

    nowPlayingDataset.data = point ? [point] : [];
    chart.update('none');
  }, [currentTime]);

  return <Scatter ref={chartRef} data={chartData} options={chartOptions}/>;
});

export default MoodChart;
