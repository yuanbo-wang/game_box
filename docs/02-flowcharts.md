# 《云朵小镇·推推奇遇》流程图与状态图

> 本文档使用 Mermaid 语法编写，在 Gitee / GitHub / VS Code（需 Mermaid 插件）中可直接渲染。
> 对应产品文档：`docs/01-product-spec.md` v4.0

---

## 目录

1. [三层社交结构总览](#1-三层社交结构总览)
2. [玩家社交链路时序图（v1.1 扩展）](#2-玩家社交链路时序图v11-扩展)
3. [核心棋盘引擎状态机](#3-核心棋盘引擎状态机)
4. [小镇每日赛状态流转](#4-小镇每日赛状态流转)
5. [数据流架构图](#5-数据流架构图)
6. [求助防骚扰判定流程](#6-求助防骚扰判定流程)
7. [魔鬼关卡设计判定流程](#7-魔鬼关卡设计判定流程)
8. [小镇每日赛玩家时序图](#8-小镇每日赛玩家时序图)

---

## 1. 三层社交结构总览

展示"魔鬼关卡 → 求助 → 小镇每日赛"的因果递进关系。

```mermaid
graph TB
    subgraph L1["第一层：情绪层（地基）"]
        A1["魔鬼关卡<br/>每章第 8 关"]
        A2["设计要点：看似能过"]
        A3["前 70% 顺利<br/>最后 1-2 个物件卡死"]
        A4["玩家产生<br/>『就差一点』的痛感"]
        A1 --> A2 --> A3 --> A4
    end

    subgraph L2["第二层：留存层"]
        B1["求助机制"]
        B2["形态① 加油<br/>好友点一下给提示"]
        B3["形态② 传地址<br/>好友挑战同一关"]
        B1 --> B2
        B1 --> B3
    end

    subgraph L3["第三层：获客层"]
        C1["小镇每日赛<br/>全服同题"]
        C2["每人每天一次机会<br/>比步数 · 揭晓击败百分比"]
        C3["结果海报自带传播<br/>讨论与次日回访"]
        C1 --> C2 --> C3
    end

    A4 -->|"把『痛』转成<br/>关系互动"| B1
    B2 -->|"把『互动』转成<br/>传播动力"| C1

    style L1 fill:#FFF4E6,stroke:#E8A87C,stroke-width:2px
    style L2 fill:#E8F5E9,stroke:#81C784,stroke-width:2px
    style L3 fill:#E3F2FD,stroke:#64B5F6,stroke-width:2px
    style A4 fill:#FFE0B2,stroke:#E8A87C
    style C3 fill:#BBDEFB,stroke:#64B5F6
```

**核心因果链**：没有第一层制造痛点，上面两层都是空的。参考《羊了个羊》——裂变不是设计出来的，是难度逼出来的。

---

## 2. 玩家社交链路时序图（v1.1 扩展链路）

完整的"卡关 → 求助 → 加油 → 1v1 挑战 → 接龙"链路。
⚠️ v4.0 起，1v1 挑战链接降为 **v1.1 扩展**；主线社交链路（每日赛）见第 8 节。

```mermaid
sequenceDiagram
    autonumber
    participant P as 玩家 A
    participant G as 游戏客户端
    participant S as 服务端<br/>(挑战赛数据)
    participant W as 微信开放数据域
    participant F as 好友 B

    Note over P,G: 阶段一：卡关
    P->>G: 进入第 8 关（魔鬼关卡）
    G-->>P: 展示棋盘（看起来很简单）
    P->>G: 尝试推物件 A（最直觉选择）
    G-->>P: 提示"再试试"（撤销可救棋局，步数不返还）
    P->>G: 反复尝试 3-5 次
    Note right of P: 意识到"一开始思路就错了"<br/>← 分享欲望最强的时刻

    Note over P,G: 阶段二：求助（形态① 加油）
    P->>G: 点击"呼叫小伙伴"
    G->>G: 检查每日求助次数（≤3）
    G->>S: 上报求助事件
    G->>F: 发送求助卡片
    F->>G: 点一下"加油"
    G->>S: 记录好友加油
    G-->>P: 获得 1 次免费提示
    G-->>F: 好友获得 1 颗小星星
    P->>G: 使用提示 → 通关

    Note over P,G: 阶段三：结算与发起挑战
    G-->>P: 结算页："你用了 23 步"<br/>挑战 92% 的镇民
    P->>G: 点击"发起挑战"
    G->>S: 创建挑战（关卡 N，步数 23）
    S-->>G: 返回挑战 ID / 链接
    G->>F: 分享挑战链接

    Note over F,G: 阶段四：好友迎战
    F->>G: 点开挑战链接
    G->>S: 拉取关卡 N 配置
    Note right of F: 隐藏 A 的成绩<br/>（避免"反正赢不了"）
    F->>G: 挑战并通关（19 步）
    G->>S: 提交成绩 19 步
    S-->>G: 对比结果
    G-->>F: "你赢了！比 A 少用 4 步 🏆"
    G-->>P: 通知："B 比你少用 4 步"

    Note over P,F: 阶段五：接龙
    alt B 输了且差距 ≤2 步
        G-->>F: "就差 2 步！再来一次？"
        F->>G: 发起反向挑战
        G->>P: 发送挑战
    else B 赢了
        G-->>F: 炫耀按钮 → 生成可爱海报
        F->>F: 分享到朋友圈 → 传播链延伸
    end

    Note over W,G: 排行榜（并行）
    G->>W: 拉取好友最少步数
    W-->>G: 好友数据
    G-->>P: 排行榜："就差一步！"
```

---

## 3. 核心棋盘引擎状态机

纯函数引擎的状态流转。**每次 `move()` 返回新的不可变状态 + 事件列表**。

```mermaid
stateDiagram-v2
    [*] --> Idle: createState(levelConfig)

    Idle --> Resolving: move(state, direction)
    note right of Idle
        等待玩家输入
        可执行：滑动 / 撤销 / 重置
        显示：剩余步数 = stepBudget - steps
    end note

    Resolving --> Resolving: 触发机关连锁
    note right of Resolving
        事件队列顺序处理：
        1. player_moved
        2. box_pushed
        3. conveyor_activated
        4. slope_slided
        5. spring_bounced
        6. teammate_moved
    end note

    Resolving --> Rendering: 事件队列处理完毕

    Rendering --> WinCheck: 播放动画
    Rendering --> UndoCheck: 播放动画

    WinCheck --> Win: checkWin() === true<br/>（步数预算内完成）
    WinCheck --> BudgetCheck: 未胜利

    BudgetCheck --> Failed: steps >= stepBudget<br/>（步数耗尽 · v4.0 失败态）
    BudgetCheck --> StuckCheck: 预算仍有剩余

    StuckCheck --> Deadlock: 物件被推到死角
    StuckCheck --> Idle: 未卡死

    Deadlock --> Idle: 播放"歪头"动画<br/>提示可撤销

    UndoCheck --> Idle: 撤销（棋盘回退）<br/>⚠️ 步数不返还

    Win --> [*]: 记录本关成绩<br/>触发结算

    Failed --> Idle: 看广告加步复活<br/>stepBudget += 3
    Failed --> [*]: 重开本关 / 放弃

    state "死局判定" as Deadlock {
        [*] --> 计算可行解: 贪心验证
        计算可行解 --> 无解: 剩余步数不足
        计算可行解 --> 有解: 尚可挽回
    }
```

---

## 4. 小镇每日赛状态流转（v4.0 主链路）

每日赛是全服同题、每人一次机会的日常竞技，替代 v3.0 的 1v1 挑战链接成为第三层社交主体。
每个玩家一天只挑战一次，"今天过了没、用了几步"成为天然的公开话题；结果海报是传播载体。
（1v1 挑战链接接龙降为 v1.1 扩展，链路时序图见第 2 节）

```mermaid
stateDiagram-v2
    [*] --> 拉取今日赛: 进入每日赛
    拉取今日赛 --> 判定期次: 服务端返回今日关卡

    判定期次 --> 未挑战: 今日未挑战
    判定期次 --> 已挑战: 今日已挑战

    未挑战 --> 挑战中: 开始（消耗今日机会）
    挑战中 --> 加步复活: 步数耗尽
    note right of 加步复活
        看激励视频 → stepBudget += 3
        每日仅 1 次
    end note
    加步复活 --> 挑战中

    挑战中 --> 通关: 步数预算内完成
    挑战中 --> 未完成: 复活用尽仍未过

    通关 --> 提交成绩: 上报步数 / 用时
    提交成绩 --> 结果与排名: "用了 5 步 · 击败 87% 的镇民"
    结果与排名 --> 生成海报: 分享截图
    生成海报 --> [*]

    未完成 --> [*]: 今日无成绩<br/>明早 00:00 新关卡

    已挑战 --> [*]: 查看成绩 / 排名

    state 判定期次 as "机会判定（服务端）" {
        [*] --> 校验: 查询 openId 今日 attempts
        校验 --> 可用: attempts = 0
        校验 --> 已用: attempts >= 1
    }
```

---

## 5. 数据流架构图

分层架构：**UI 层 / 游戏逻辑层 / 引擎层 / 数据层**。

```mermaid
graph TD
    subgraph UI["UI 层（Phaser Scene）"]
        U1[主菜单场景]
        U2[选关场景]
        U3[游戏场景]
        U4[结算场景]
        U5[每日赛场景]
        U6[排行榜场景（v1.1）]
    end

    subgraph LOGIC["游戏逻辑层"]
        L1[操作解析器<br/>滑动 → direction]
        L2[提示系统<br/>getHint]
        L3[撤销管理器<br/>回退棋盘 · 步数锁死]
        L4[复活/奖励管理]
    end

    subgraph ENGINE["引擎层（纯函数，可单测）"]
        E1[createState]
        E2[move<br/>含限步判定]
        E3[checkWin]
        E4[getHint]
        E5[serializeBoard / undo]
        E6[死局判定器]
    end

    subgraph DATA["数据层"]
        D1[关卡配置<br/>LevelConfig JSON]
        D2[本地进度<br/>wx.setStorage]
        D3[微信开放数据域<br/>好友数据（v1.1）]
        D4[每日赛服务端<br/>云函数 + 云数据库]
    end

    U3 -->|"滑动输入"| L1
    L1 -->|"{direction}"| E2
    E2 -->|"{newState, events}"| U3
    U3 -->|"播放动画"| U3

    L2 --> E4
    L3 --> E5
    U3 --> E3
    E3 -->|"boolean"| U4
    U3 --> E6
    E6 -->|"deadlock?"| L2

    D1 -->|"加载"| E1
    U4 -->|"本关成绩"| D2
    D2 <--> D3
    U5 <--> D4
    D4 -->|"每日关卡 / 成绩分布"| U5

    style ENGINE fill:#E8F5E9,stroke:#66BB6A,stroke-width:2px
    style UI fill:#E3F2FD,stroke:#42A5F5,stroke-width:1px
    style LOGIC fill:#FFF4E6,stroke:#FFA726,stroke-width:1px
    style DATA fill:#F3E5F5,stroke:#AB47BC,stroke-width:1px
```

**关键约束**：引擎层（ENGINE）为纯函数，**零副作用、零渲染依赖**，可直接单元测试，也是软著源代码的主要来源。

---

## 6. 求助防骚扰判定流程

对应产品文档 6.4 的反骚扰硬约束。

```mermaid
flowchart TD
    START([玩家点击"呼叫小伙伴"]) --> CHECK_SELF{自身今日<br/>求助次数 < 3 ?}
    CHECK_SELF -->|否| REJECT1[提示：今天求助次数已用完<br/>明天再来吧 🥺]
    CHECK_SELF -->|是| SELECT[选择求助好友]

    SELECT --> CHECK_TARGET{该好友 24h 内<br/>是否已被求助过?}
    CHECK_TARGET -->|是| REJECT2[该好友今天已帮过你<br/>换一位小伙伴吧]
    CHECK_TARGET -->|否| SEND[发送求助卡片]
    REJECT2 --> SELECT

    SEND --> REWARD_SELF[玩家获得 1 次免费提示]
    SEND --> FRIEND_ACTION{好友动作}

    FRIEND_ACTION -->|点一下"加油"| REWARD_FRIEND[好友获得 1 颗小星星 ⭐]
    FRIEND_ACTION -->|忽略| EXPIRE[卡片 24h 后失效]

    REWARD_FRIEND --> COUNTER[计数 +1<br/>自身计数 / 好友计数]
    REWARD_SELF --> COUNTER
    COUNTER --> END([结束])

    REJECT1 --> END

    style REJECT1 fill:#FFCDD2,stroke:#E57373
    style REJECT2 fill:#FFCDD2,stroke:#E57373
    style REWARD_SELF fill:#C8E6C9,stroke:#66BB6A
    style REWARD_FRIEND fill:#C8E6C9,stroke:#66BB6A
```

**三条硬约束**：

| 约束 | 值 | 原因 |
|:---|:---|:---|
| 自身每日求助上限 | 3 次 | 对齐微信分享频次隐性限制 |
| 同一好友冷却 | 24 小时 | 防止对同一个人反复骚扰 |
| 求助必须"给好友东西" | 星星 | 让帮助行为有正收益，不尴尬 |

---

## 7. 魔鬼关卡设计判定流程

用于关卡设计者自检：一关是否够格被称为"魔鬼关卡"。

```mermaid
flowchart TD
    S([设计一个魔鬼关卡]) --> Q1{视觉上<br/>是否看起来可解?}
    Q1 -->|否| F1[❌ 玩家会直接放弃<br/>调整为标准规格棋盘]
    Q1 -->|是| Q2{前 70% 流程<br/>是否顺利?}

    Q2 -->|否| F2[❌ 挫败感来得太早<br/>会变成"劝退关卡"]
    Q2 -->|是| Q3{是否在最后<br/>1-2 个物件卡死?}

    Q3 -->|否| F3[❌ 没有"就差一点"的痛感<br/>社交动机不足]
    Q3 -->|是| Q4{是否存在<br/>1-2 种正确解?}

    Q4 -->|否·真无解| F4[❌ 致命：会引发<br/>《羊了个羊》式口碑危机]
    Q4 -->|是| Q5{玩家第 3-5 次<br/>尝试才会醒悟?}

    Q5 -->|第 1 次就懂| F5[❌ 太简单，没有讨论度]
    Q5 -->|是| Q6{失败提示是否<br/>不羞辱玩家?}
    Q5 -->|超过 10 次| F6[❌ 太磨人，放弃率过高]

    Q6 -->|否| F7[❌ 破坏治愈系人设<br/>改为"再想想，你一定可以"]
    Q6 -->|是| PASS[✅ 通过：可作为魔鬼关卡]

    PASS --> CHK1[公示"有解"<br/>保留解路径存档]
    CHK1 --> CHK2[配套文案：<br/>关卡名《就差一步》]
    CHK2 --> CHK3[配套海报：<br/>"据说 90% 的人在这里放弃"]
    CHK3 --> END([上线])

    F1 --> END
    F2 --> END
    F3 --> END
    F4 --> END
    F5 --> END
    F6 --> END
    F7 --> END

    style PASS fill:#C8E6C9,stroke:#66BB6A,stroke-width:2px
    style F4 fill:#FFCDD2,stroke:#E57373,stroke-width:2px
    style CHK1 fill:#FFF9C4,stroke:#FDD835
```

---

## 8. 小镇每日赛玩家时序图（v4.0 主链路）

从"进入每日赛"到"分享海报 → 次日回访"的完整链路，前后端接口实现依据。

```mermaid
sequenceDiagram
    autonumber
    participant P as 玩家
    participant G as 游戏客户端
    participant S as 服务端（云函数）
    participant A as 激励视频广告
    participant F as 看到海报的人

    Note over P,G: 阶段一：进入与机会判定
    P->>G: 进入每日赛
    G->>S: getDailyChallenge(date)
    S-->>G: 今日关卡配置 + 我的状态
    G-->>P: "今日仅此一次机会"

    Note over P,G: 阶段二：限步挑战
    P->>G: 滑动操作（每步消耗 1 步预算）
    G-->>P: 剩余步数实时显示（≤2 步告急变红）
    alt 步数耗尽
        G-->>P: "再加 3 步试试？"
        P->>A: 观看激励视频（每日 1 次）
        A-->>G: onClose(isEnded = true)
        G->>G: stepBudget += 3，继续当前棋盘
    end
    P->>G: 在预算内完成全部归位
    G-->>P: 通关动画

    Note over P,G: 阶段三：成绩与海报
    G->>S: submitDailyResult(date, steps, duration)
    S-->>G: "用了 5 步 · 击败 87% 的镇民"（服务端已校验）
    G-->>P: 结果页 + 生成海报
    P->>F: 分享海报（截图 / 转发）
    Note right of F: 看到"小狐狸用了 5 步<br/>击败 87% 的镇民"

    Note over P,G: 阶段四：次日回访
    S-->>G: 次日 00:00 发布新关卡（预生成管线供数）
    G-->>P: "今天的每日赛已刷新"
    Note left of P: 已挑战状态仅可查看成绩<br/>机会每天重置
```

**服务端关键约束**：

| 约束 | 说明 |
|:---|:---|
| 一次机会 | `getDailyChallenge` 依据 `attempts` 判定；不信任客户端 |
| 加步仅一次 | 复活次数服务端计数，每日上限 1 |
| 成绩合法 | `submitDailyResult` 校验 `optimalSteps ≤ steps ≤ stepBudget`，越界拒绝 |
| 不提前揭晓 | 提交前不返回他人成绩，只返回分布统计（击败百分比） |

---

## 附：图表索引

| 编号 | 图表 | 用途 |
|:---|:---|:---|
| 1 | 三层社交结构总览 | 立项汇报、团队对齐 |
| 2 | 1v1 挑战链路时序图（v1.1 扩展） | 扩展功能开发依据 |
| 3 | 核心棋盘引擎状态机（含失败态） | 引擎开发与单测依据 |
| 4 | 小镇每日赛状态流转 | 每日赛客户端/服务端状态机设计 |
| 5 | 数据流架构图 | 技术评审、模块划分 |
| 6 | 求助防骚扰判定流程 | 风控实现依据 |
| 7 | 魔鬼关卡设计判定流程 | 关卡设计者自检清单 |
| 8 | 小镇每日赛玩家时序图 | 每日赛前后端接口实现依据 |

---

*文档版本：v2.0 | 配套产品文档 v4.0 | 编写日期：2026 年 10 月*
