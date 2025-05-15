<route lang="json">
  {
    "style": {
      "navigationBarTitleText": "报告查看"
    }
  }
  </route>

<script setup lang="ts">
import { getReport } from '@/api/report'
import { NAV_BAR_HEIGHT } from '@/components/nav-bar/nav-bar'
import type { ReportModel } from '@/model/report'

const router = useRouter<{
  scaleRecordId: number
  patientId: number
}>()
const loading = ref(false)
const scrollHeight = ref('100vh')

const scaleRecordId = computed(() => router.query.scaleRecordId)
const patientId = computed(() => router.query.patientId)
const reportData = ref<ReportModel>()
const isFirstLoad = ref(true)

const assessmentLevelColor = {
  无症状: '#52C41A', // 低
  轻度症状: '#FAAD14', // 轻度
  中度症状: '#F46B08', // 中度
  重度症状: '#F5222D', // 高度
}

function getAssessmentLevelColor(level: string) {
  return assessmentLevelColor[level as keyof typeof assessmentLevelColor]
}
const loadingPlaceholder = computed(() => {
  return {
    height: `calc(100vh - ${NAV_BAR_HEIGHT}px)`,
  }
})

function getReportData() {
  return getReport({
    scaleRecordId: scaleRecordId.value,
    patientId: patientId.value,
  }).then((res) => {
    reportData.value = res.data.reportValueVo
  }).finally(() => {
    loading.value = false
    isFirstLoad.value = false
  })
}

const reportStyle = computed(() => {
  return {
    backgroundImage: `url(${STATIC_URL}/images/report-bg.png)`,
    backgroundSize: '750rpx 450rpx',
    backgroundPosition: 'center bottom',
    backgroundRepeat: 'no-repeat',
  }
})

/**
 * 格式化分数
 */
function formatScore() {
  const minNUm = reportData.value?.minScore || 0
  const maxNum = reportData.value?.maxScore || 100
  return {
    minNUm,
    maxNum,
  }
}

const reportDataValue = computed(() => {
  const minNum = reportData.value?.minScore ?? 0
  const maxNum = reportData.value?.maxScore ?? 100
  let score = reportData.value?.score ?? 0

  // 如果 min 和 max 都是负数，但 score 是正的，那就取反
  if (minNum < 0 && maxNum < 0 && score > 0) {
    score = -score
  }

  // 自动排序，避免 min/max 颠倒
  let realMin = minNum
  let realMax = maxNum
  if (realMin > realMax)
    [realMin, realMax] = [realMax, realMin]

  const range = realMax - realMin
  const percent = range === 0 ? 0 : ((score - realMin) / range) * 100
  const finalPercent = Math.min(Math.max(percent, 0), 100)
  return finalPercent
})
onReady(() => {
  getReportData()
})

/**
 * 暂时性解决 h5 端滚动底部再下拉刷新时的层级覆盖问题
 * 后续需要解决
 */
onMounted(() => {
  const sysInfo = uni.getWindowInfo()
  const navHeight = isH5 ? 44 : 0// uni-page-head 的高度（如你是默认导航栏，可用这个）
  scrollHeight.value = `${sysInfo.windowHeight - navHeight}px`
})
</script>

<template>
  <refresh-view
    v-if="!isFirstLoad"
    v-model="loading"
    :height="scrollHeight"
    @refresh="getReportData"
  >
    <view class="report-container bg-#b8e5e3 min-h-100vh ">
      <view
        :style="reportStyle"
        class="report-container-head  flex flex-col justify-between items-center h-450rpx w-full px-25rpx "
      >
        <text class="text-#286996 font-size-42rpx mt-80rpx">
          {{ reportData?.scaleName }}
        </text>
        <view class="bg-#fff h-166rpx  w-full border-rd-40rpx py-23rpx px-34rpx text-primary text-size-mini">
          <view class="report-border border-color-#99d4d0   flex justify-between items-end pb-10rpx">
            <text class="text-size-medium">
              个人基本信息
            </text>
            <text class="text-size-16rpx">
              PERSONAL BASIC INFORMATION
            </text>
          </view>
          <view class="info-grid mt-10rpx">
            <!-- 姓名 -->
            <view class="grid-item">
              <text>
                姓名：
              </text>
              <text>
                {{ reportData?.patientName || '-' }}
              </text>
            </view>
            <!-- 性别 -->
            <view class="grid-item">
              <text>
                性别：
              </text>
              <text>
                {{ reportData?.genderValue || '-' }}
              </text>
            </view>
            <!-- 年龄 -->
            <view class="grid-item">
              <text>
                年龄：
              </text>
              <text>
                {{ reportData?.age || '-' }}
              </text>
            </view>
            <!-- 受教育程度 -->
            <view class="grid-item">
              <text>
                受教育程度：
              </text>
              <text>
                {{ reportData?.educationValue || '-' }}
              </text>
            </view>
            <!-- 测试时间 -->
            <view class="grid-item full-width">
              <text>
                测试时间：
              </text>
              <text>
                {{ $formatTime(reportData?.testTime, 'YYYY-MM-DD HH:mm:ss') || '-' }}
              </text>
            </view>
          </view>
        </view>
      </view>
      <view class="flex-1 report-content px-32rpx ">
        <view class="bg-#bee7e5 h-full pt-40rpx px-40rpx">
          <view class="text-#87CCC7 flex  flex-col items-center mb-20rpx report-border border-color-#99d4d0 pb-10rpx mb-10rpx">
            <text class="text-size-large">
              报告说明
            </text>
            <text class="text-size-16rpx mt-10rpx">
              REPORT SHOWS
            </text>
          </view>
          <view class="my-40rpx flex-center">
            <circular-progress
              :value="reportDataValue"
              :text="`${reportData?.score}` || '0'"
              :sub-text="reportData?.degreeValue"
              :sub-text-color="getAssessmentLevelColor(reportData?.degreeValue || '无症状')"
              is-custom-num
              :min-num="formatScore().minNUm"
              :max-num="formatScore().maxNum"
            />
          </view>
          <view class="text-#87CCC7 report-border border-color-#99d4d0 w-full flex justify-between items-end">
            <text class=" pb-5rpx">
              结果分析
            </text>
            <text class="text-size-16rpx">
              INTERPRETATION OF RESULT
            </text>
          </view>

          <view class="text-size-medium mt-40rpx pb-20rpx">
            <text class="allResult">
              {{ reportData?.allResult || '-' }}
            </text>
          </view>
        </view>
      </view>
    </view>
  </refresh-view>
  <template v-if="isFirstLoad">
    <!-- ✅ 首次加载显示 -->
    <view class="flex-center " :style="loadingPlaceholder">
      <image
        class="placeholder-img"
        src="/static/images/loading-placeholder.png"
        mode="aspectFill"
      />
    </view>
  </template>
</template>

<style  lang="scss">
.report-container {
  height: 100%;
}
.report-border {
  border-bottom: 1px solid;
}
.report-container-head {
  background-color: #ffffff;
  border-radius: 20rpx;
  box-shadow: 0 10rpx 30rpx rgba(0, 0, 0, 0.08); // 阴影高度、柔和程度

  .info-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr); // 平均分三列
    gap: 16rpx 20rpx; // 可根据需要微调上下、左右间距

    .grid-item {
      display: flex;
      flex-wrap: nowrap;
    }
  }
}
.report-content {
  min-height: calc(100vh - 450rpx);
}

.allResult {
  line-height: 1.5;
}
.full-width {
  grid-column: span 2;
}
</style>
