# 定义非功能性需求

> 互联网的构建如此出色，以至于大多数人将其视为一种自然资源，就像太平洋，而不是人造的东西。上一次出现如此规模且几乎没有错误的技术是什么时候？
>
> 艾伦·凯，在接受《Dr Dobb's Journal》采访时（2012）

如果您正在构建一个应用程序，您将会受到一系列需求的驱动。您列表的顶部很可能是应用程序必须提供的功能：您需要什么屏幕和按钮，以及每个操作应该做什么，以实现您软件的目的。这些就是您的功能需求。

此外，您可能还有一些非功能性需求：例如，应用程序应该快速、可靠、安全、符合法律要求，并且易于维护。这些需求可能没有明确写下来，因为它们看起来有些显而易见，但它们与应用程序的功能同样重要：一个极其缓慢或不可靠的应用程序几乎可以说是不存在的。

许多非功能性需求，例如安全性，超出了本书的范围。但我们将考虑一些非功能性需求，本章将帮助您为自己的系统阐明这些需求：

- 如何定义和衡量系统的性能（见[描述性能](#描述性能)）；

- 服务可靠性意味着什么——即使在出现问题时仍能正常工作（见[可靠性与容错性](#可靠性和容错性)）；

- 通过有效的方式在系统负载增加时添加计算能力，使系统具备可扩展性（见[可扩展性](#可扩展性)）；并且

- 使长期维护系统变得更加容易（见[可维护性](#可维护性)）。

本章引入的术语在接下来的章节中也将非常有用，当我们深入探讨数据密集型系统的实现细节时。然而，抽象的定义可能会显得相当枯燥；为了使这些概念更加具体，我们将以一个社交网络服务的案例研究开始本章，这将提供性能和可扩展性的实际示例。

## 案例研究：社交网络主页时间线

想象一下，你被赋予了实现一个社交网络的任务，风格类似于 X（前身为 Twitter），用户可以发布消息并关注其他用户。这将是对这样一个服务实际运作方式的巨大简化[1, 2, 3]，但它将有助于说明在大规模系统中出现的一些问题。

假设用户每天发布 5 亿条帖子，平均每秒发布 5700 条。偶尔，发布速率可以高达每秒 15 万条帖子[4]。我们还假设平均每个用户关注 200 人，并有 200 个粉丝（尽管范围非常广泛：大多数人只有少数几个粉丝，而一些名人如巴拉克·奥巴马则拥有超过 1 亿个粉丝）。

### 表示用户、帖子和关注关系

想象一下，我们将所有数据保存在一个关系数据库中，如图 2-1 所示。我们有一个用户表，一个帖子表和一个关注关系表。

![ddia 0201](/ddia/ddia_0201.png)
**图 2-1. 一个简单的社交网络关系模式，其中用户可以相互关注。**

假设我们社交网络必须支持的主要读取操作是主页时间线，它显示你所关注的人的最近帖子（为简单起见，我们将忽略广告、来自你未关注的人的推荐帖子以及其他扩展）。我们可以写以下 SQL 查询来获取特定用户的主页时间线：

```SQL
SELECT posts.*, users.* FROM posts
JOIN follows ON posts.sender_id = follows.followee_id
JOIN users ON posts.sender_id = users.id
WHERE follows.follower_id = current_user
ORDER BY posts.timestamp DESC
LIMIT 1000
```

为了执行这个查询，数据库将使用 `follows` 表来查找 `current_user` 关注的所有人，查找这些用户的最近帖子，并按时间戳排序，以获取任何被关注用户的最新 1,000 条帖子。

帖子应该是及时的，因此我们假设在某人发布帖子后，我们希望他们的关注者能够在 5 秒内看到它。实现这一点的一种方法是让用户的客户端在用户在线时每 5 秒重复一次上述查询（这被称为轮询）。如果我们假设有 1,000 万用户同时在线并登录，这意味着每秒运行查询 200 万次。即使你增加轮询间隔，这也是一个很大的数字。

此外，上述查询相当昂贵：如果你关注了 200 个人，它需要获取这 200 个人的最近帖子列表，并合并这些列表。每秒 200 万条时间线查询意味着数据库需要每秒查找某个发送者的最近帖子 4 亿次——这是一个巨大的数字。而且这是平均情况。一些用户关注了数万个账户；对于他们来说，这个查询的执行成本非常高，且难以快速完成。

### 物化和更新时间线

我们如何做得更好？首先，服务器主动向当前在线的任何关注者推送新帖子，而不是轮询，这样会更好。其次，我们应该预计算上述查询的结果，以便用户对其主页时间线的请求可以从缓存中提供。

想象一下，对于每个用户，我们存储一个数据结构，包含他们的主页时间线，即他们所关注的人的最近帖子。每当用户发布帖子时，我们会查找他们的所有关注者，并将该帖子插入每个关注者的主页时间线——就像将消息投递到邮箱一样。现在，当用户登录时，我们可以简单地提供给他们这个我们预先计算好的主页时间线。此外，为了接收关于他们时间线上的任何新帖子的通知，用户的客户端只需订阅添加到他们主页时间线的帖子流。

这种方法的缺点是，每当用户发布帖子时，我们需要做更多的工作，因为主页时间线是需要更新的派生数据。该过程在图 2-2 中进行了说明。当一个初始请求导致多个下游请求被执行时，我们使用“扇出”这个术语来描述请求数量增加的倍数。

![ddia 0202](/ddia/ddia_0202.png)
**图 2-2. 扇出：将新帖子传递给发布帖子的用户的每个关注者。**

以每秒发布 5,700 条帖子计算，如果平均每条帖子能达到 200 个关注者（即粉丝扩展因子为 200），我们将需要每秒进行超过 100 万次的主页时间线写入。这是一个很大的数字，但与我们本来需要进行的每秒 4 亿次按发送者查找帖子相比，这仍然是一个显著的节省。

如果由于某些特殊事件帖子发布的速度激增，我们不必立即进行时间线的投递——我们可以将其排队，并接受帖子在关注者的时间线中显示会暂时延迟。即使在这样的负载高峰期间，时间线的加载速度仍然很快，因为我们只是从缓存中提供它们。

这个预计算和更新查询结果的过程称为物化，时间线缓存就是物化视图的一个例子（这是我们将在[链接即将到来]中进一步讨论的概念）。物化的缺点是，每当一位名人发布帖子时，我们现在必须进行大量工作，将该帖子插入到他们数百万个关注者的主页时间线中。

解决这个问题的一种方法是将名人帖子与其他人的帖子分开处理：我们可以通过将名人帖子单独存储，并在读取时与物化时间线合并，从而节省将它们添加到数百万时间线的精力。尽管有这样的优化，在社交网络上处理名人仍然可能需要大量的基础设施 [5]。

## 描述性能

大多数关于软件性能的讨论考虑两种主要类型的指标：

**响应时间**
从用户发出请求到收到请求答案之间的经过时间。测量单位为秒（或毫秒，或微秒）。

**吞吐量**
系统每秒处理的请求数量或每秒处理的数据量。对于给定的硬件资源分配，存在一个最大吞吐量。测量单位为每秒数据量。

在社交网络案例研究中，“每秒帖子数”和“每秒时间线写入数”是吞吐量指标，而“加载主页时间线所需的时间”或“帖子送达关注者所需的时间”是响应时间指标。

吞吐量和响应时间之间通常存在联系；图 2-3 中勾勒了在线服务的这种关系示例。当请求吞吐量较低时，服务的响应时间较低，但随着负载增加，响应时间也会增加。这是由于排队造成的：当请求到达一个负载很高的系统时，CPU 很可能正在处理先前的请求，因此新到的请求需要等待直到先前的请求完成。当吞吐量接近硬件能够处理的最大值时，排队延迟会急剧增加。

![ddia 0203](/ddia/ddia_0203.png)
**图 2-3. 随着服务的吞吐量接近其容量，由于排队，响应时间急剧增加。**

::: tip **当一个过载的系统无法恢复时**
如果一个系统接近过载，吞吐量接近极限，它有时会进入一个恶性循环，变得效率更低，从而更加过载。例如，如果有一长队请求在等待处理，响应时间可能会增加到客户超时并重新发送请求。这导致请求的速率进一步增加，使问题更加严重——重试风暴。即使负载再次减少，这样的系统可能仍然保持在过载状态，直到重启或以其他方式重置。这个现象被称为亚稳态故障，它可能导致生产系统出现严重的停机 [6, 7]。

为了避免重试过载服务，您可以在客户端增加并随机化连续重试之间的时间（指数退避 [8, 9]），并暂时停止向最近返回错误或超时的服务发送请求（使用断路器 [10, 11] 或令牌桶算法 [12]）。服务器也可以检测到何时接近过载，并主动开始拒绝请求（负载削减 [13]），并发送响应请求客户端减缓速度（背压 [1, 14]）。队列和负载均衡算法的选择也会有所不同 [15]。
:::

在性能指标方面，响应时间通常是用户最关心的，而吞吐量决定了所需的计算资源（例如，您需要多少台服务器），因此也影响了服务特定工作负载的成本。如果吞吐量可能超过当前硬件所能处理的范围，则需要扩展容量；如果通过增加计算资源可以显著提高最大吞吐量，则该系统被称为可扩展的。

在本节中，我们将主要关注响应时间，并将在[可扩展性](#可扩展性)中回到吞吐量和可扩展性。

### 延迟和响应时间

“延迟”和“响应时间”有时可以互换使用，但在本书中我们将以特定的方式使用这些术语（如图 2-4 所示）：

响应时间是客户端所看到的；它包括系统中任何地方产生的所有延迟。

服务时间是指服务积极处理用户请求的持续时间。

排队延迟可能在流程的多个点发生：例如，在请求被接收后，它可能需要等待直到 CPU 可用才能被处理；如果同一台机器上的其他任务通过出站网络接口发送大量数据，响应数据包可能需要在发送到网络之前进行缓冲。

延迟是一个涵盖所有请求未被积极处理的时间的术语，即请求处于潜伏状态的时间。特别是，网络延迟或网络延时指的是请求和响应在网络中传输所花费的时间。

![ddia 0204](/ddia/ddia_0204.png)
**图 2-4. 响应时间、服务时间、网络延迟和排队延迟。**

在图 2-4 中，时间从左到右流动，每个通信节点显示为一条水平线，请求或响应消息则显示为从一个节点到另一个节点的粗斜箭头。在本书中，您将经常遇到这种风格的图表。

响应时间可能会在每个请求之间显著变化，即使您不断重复相同的请求。许多因素可能会导致随机延迟：例如，切换到后台进程的上下文切换、网络数据包的丢失和 TCP 重传、垃圾回收暂停、强制从磁盘读取的页面错误、服务器机架中的机械振动[16]，或其他许多原因。我们将在[即将到来的链接]中更详细地讨论这个主题。

排队延迟通常占响应时间变动的很大一部分。由于服务器只能并行处理少量事务（例如，受其 CPU 核心数量的限制），只需少量慢请求就能阻碍后续请求的处理——这种现象称为首行阻塞。即使后续请求的服务时间很快，客户端也会因为等待前一个请求完成而看到较慢的整体响应时间。排队延迟不属于服务时间，因此在客户端测量响应时间非常重要。

### 平均值、中位数和百分位数

由于响应时间在不同请求之间变化，我们需要将其视为一个值的分布，而不是一个单一的数字。在图 2-5 中，每个灰色条形代表一个对服务的请求，其高度显示该请求所花费的时间。大多数请求相对较快，但偶尔会有一些异常值花费更长时间。网络延迟的变化也被称为抖动。

![ddia 0205](/ddia/ddia_0205.png)
**图 2-5. 说明均值和百分位数：对服务的 100 个请求样本的响应时间。**

报告服务的平均响应时间是很常见的做法（从技术上讲，是算术平均数：即将所有响应时间相加，然后除以请求的数量）。平均响应时间对于估算吞吐量限制是有用的[17]。然而，如果你想知道“典型”的响应时间，平均值并不是一个很好的指标，因为它并不能告诉你有多少用户实际上经历了这种延迟。

通常使用百分位数会更好。如果你将响应时间列表从最快到最慢排序，那么中位数就是中间点：例如，如果你的中位响应时间是 200 毫秒，这意味着一半的请求在 200 毫秒内返回，另一半的请求则需要更长时间。这使得中位数成为一个很好的指标，如果你想知道用户通常需要等待多长时间。中位数也被称为第 50 百分位数，有时缩写为 p50。

为了了解你的异常值有多严重，你可以查看更高的百分位数：95th、99th 和 99.9th 百分位数是常见的（缩写为 p95、p99 和 p999）。它们是响应时间的阈值，在这个阈值下，95%、99% 或 99.9% 的请求响应时间都比该阈值快。例如，如果 95th 百分位数的响应时间是 1.5 秒，这意味着每 100 个请求中有 95 个请求的响应时间少于 1.5 秒，而 5 个请求的响应时间为 1.5 秒或更长。图 2-5 说明了这一点。

响应时间的高百分位数，也称为尾延迟，十分重要，因为它们直接影响用户对服务的体验。例如，亚马逊在描述内部服务的响应时间要求时使用 99.9th 百分位数，尽管这只影响每 1,000 个请求中的 1 个。这是因为请求最慢的客户通常是那些账户上有最多数据的客户，因为他们进行了许多购买——也就是说，他们是最有价值的客户 [18]。确保网站对这些客户快速响应，以保持他们的满意度是非常重要的。

另一方面，优化 99.99 百分位（最慢的 1/10,000 请求）被认为成本过高，并且对亚马逊的目的没有足够的收益。在非常高的百分位上减少响应时间是困难的，因为它们容易受到你无法控制的随机事件的影响，并且收益递减。

::: tip **响应时间对用户的影响**

直观上看，快速的服务对用户来说比慢速的服务更好[19]。然而，获取可靠的数据来量化延迟对用户行为的影响却出乎意料地困难。

一些常被引用的统计数据并不可靠。2006 年，谷歌报告称，搜索结果从 400 毫秒减慢到 900 毫秒与流量和收入下降 20%相关[20]。然而，2009 年另一项谷歌研究报告称，延迟增加 400 毫秒仅导致每天搜索量减少 0.6%[21]，同年必应发现加载时间增加两秒导致广告收入减少 4.3%[22]。这些公司的最新数据似乎并未公开。

Akamai 最近的一项研究[23]声称，响应时间增加 100 毫秒会使电子商务网站的转化率降低多达 7%；然而，仔细观察后，同一研究显示，页面加载速度非常快的情况也与较低的转化率相关！这一看似矛盾的结果可以解释为，加载速度最快的页面往往是那些没有有用内容的页面（例如，404 错误页面）。然而，由于该研究没有努力将页面内容的影响与加载时间的影响分开，因此其结果可能没有意义。

Yahoo 的一项研究[24]比较了快速加载与慢速加载搜索结果的点击率，同时控制搜索结果的质量。研究发现，当快速和慢速响应之间的差异达到 1.25 秒或更长时，快速搜索的点击量增加了 20%至 30%。
:::

### 响应时间指标的使用

高百分位在作为服务单个终端用户请求的一部分被多次调用的后端服务中尤为重要。即使您并行发起调用，终端用户请求仍然需要等待最慢的并行调用完成。只需一个慢调用就能使整个终端用户请求变慢，如图 2-6 所示。即使只有一小部分后端调用是慢的，如果终端用户请求需要多个后端调用，获得慢调用的机会就会增加，因此更高比例的终端用户请求最终会变慢（这种现象称为尾延迟放大 [25]）。

![ddia 0206](/ddia/ddia_0206.png)
**图 2-6. 当需要多个后端调用来服务一个请求时，只需一个慢的后端请求就能使整个终端用户请求变慢。**

百分位数常用于服务水平目标（SLO）和服务水平协议（SLA），作为定义服务预期性能和可用性的一种方式[26]。例如，SLO 可能设定一个目标，即服务的中位响应时间少于 200 毫秒，99 百分位数低于 1 秒，并且至少 99.9%的有效请求产生非错误响应。SLA 是一种合同，规定如果未达到 SLO 会发生什么（例如，客户可能有权获得退款）。这至少是基本思想；在实践中，为 SLO 和 SLA 定义良好的可用性指标并不简单[27, 28]。

::: tip **计算百分位数**

如果您想将响应时间百分位数添加到服务的监控仪表板中，您需要高效地持续计算它们。例如，您可能希望保持过去 10 分钟内请求的响应时间的滚动窗口。每分钟，您计算该窗口内值的中位数和各种百分位数，并将这些指标绘制在图表上。

最简单的实现是保持一个在时间窗口内所有请求的响应时间列表，并每分钟对该列表进行排序。如果这对你来说效率太低，还有一些算法可以在最小的 CPU 和内存成本下计算出百分位数的良好近似值。开源的百分位数估计库包括 HdrHistogram、t-digest [29, 30]、OpenHistogram [31]和 DDSketch [32]。

请注意，平均百分位数，例如，为了降低时间分辨率或结合来自几台机器的数据，在数学上是没有意义的——聚合响应时间数据的正确方法是将直方图相加 [33]。
:::

## 可靠性和容错性

每个人对某物可靠或不可靠的含义都有直观的理解。对于软件，典型的期望包括：

- 该应用程序执行了用户所期望的功能。

- 它能够容忍用户犯错或以意想不到的方式使用软件。

在预期的负载和数据量下，其性能足够满足所需的使用案例。

系统防止任何未经授权的访问和滥用。

如果所有这些因素共同意味着“正常工作”，那么我们可以将可靠性大致理解为“即使在出现问题时也能继续正常工作”。为了更准确地描述问题的出现，我们将区分故障和失败 [34, 35, 36]：

**故障**
故障是指系统的某个特定部分停止正常工作：例如，如果一个硬盘出现故障，或者一台机器崩溃，或者一个外部服务（系统依赖的）发生故障。

**失败**
故障是指系统整体停止向用户提供所需服务；换句话说，就是当它未能满足服务水平目标（SLO）时。

故障和故障之间的区别可能会令人困惑，因为它们是同一件事，只是在不同的层面上。例如，如果硬盘停止工作，我们会说硬盘已经故障：如果系统仅由那一个硬盘组成，它就停止了提供所需服务。然而，如果你所谈论的系统包含多个硬盘，那么单个硬盘的故障在更大系统的角度来看只是一个故障，而更大的系统可能通过在另一个硬盘上有数据的副本来容忍这个故障。

### 容错

我们称一个系统为容错系统，如果它在发生某些故障的情况下仍能继续向用户提供所需服务。如果一个系统无法容忍某个部分出现故障，我们称该部分为单点故障（SPOF），因为该部分的故障会升级为导致整个系统的故障。

例如，在社交网络案例研究中，可能发生的故障是，在扩展过程中，参与更新物化时间线的某台机器崩溃或变得不可用。为了使这个过程具备容错能力，我们需要确保另一台机器能够接管这个任务，而不会遗漏任何应该被传递的帖子，也不会重复任何帖子。（这个想法被称为精确一次语义，我们将在[链接待补充]中详细探讨。）

容错能力始终受到某些类型故障的数量限制。例如，一个系统可能能够容忍最多两块硬盘同时故障，或者最多一台三台节点崩溃。容忍任意数量的故障是没有意义的：如果所有节点都崩溃，就无能为力。如果整个地球（以及上面的所有服务器）被黑洞吞噬，容忍这种故障将需要在太空中进行网络托管——祝你好运获得这个预算项目的批准。

反直觉的是，在这样的容错系统中，通过故意触发故障来增加故障发生率是有意义的——例如，随机终止个别进程而不发出警告。这被称为故障注入。许多关键性错误实际上是由于糟糕的错误处理造成的[37]；通过故意引发故障，您可以确保容错机制不断被使用和测试，这可以增加您对自然发生故障时能够正确处理的信心。混沌工程是一种旨在通过故意注入故障等实验来提高对容错机制信心的学科[38]。

尽管我们通常更倾向于容忍故障而不是预防故障，但在某些情况下，预防比治疗更好（例如，因为没有治疗方法）。例如，在安全问题上就是这种情况：如果攻击者已经入侵了系统并获得了敏感数据的访问权限，那么这一事件是无法逆转的。然而，本书主要处理可以治愈的故障类型，如以下章节所述。

### 硬件和软件故障

当我们想到系统故障的原因时，硬件故障很快就会浮现在脑海中：

- 每年大约有 2%–5%的磁盘硬盘发生故障 [39, 40]；因此，在一个拥有 10,000 个磁盘的存储集群中，我们平均每天应该预期有一个磁盘故障。最近的数据表明，磁盘的可靠性正在提高，但故障率仍然显著 [41]。

- 每年大约有 0.5%–1%的固态硬盘（SSD）发生故障 [42]。少量的位错误会自动纠正 [43]，但不可纠正的错误大约每个驱动器每年发生一次，即使在相对较新的驱动器中（即，经历了很少的磨损）；这个错误率高于磁盘硬盘 [44, 45]。

- 其他硬件组件，如电源、RAID 控制器和内存模块也会发生故障，尽管发生频率低于硬盘 [46, 47]。

- 大约每 1000 台机器中就有一台的 CPU 核心偶尔会计算出错误的结果，这可能是由于制造缺陷造成的[ 48, 49, 50]。在某些情况下，错误的计算会导致崩溃，但在其他情况下，它只是导致程序返回错误的结果。

- RAM 中的数据也可能会被损坏，这可能是由于随机事件，例如宇宙射线，或由于永久性物理缺陷造成的。即使使用了带有错误更正代码（ECC）的内存，每年仍有超过 1%的机器会遇到不可更正的错误，这通常会导致机器崩溃，并且受影响的内存模块需要更换[51]。此外，某些病态的内存访问模式可能会以较高的概率翻转位[52]。

- 整个数据中心可能会变得不可用（例如，由于停电或网络配置错误）或甚至被永久摧毁（例如，由于火灾或洪水）。尽管这种大规模故障是罕见的，但如果某项服务无法容忍数据中心的损失，其影响可能是灾难性的[53]。

这些事件发生得足够少，以至于在处理小型系统时，您通常不需要担心它们，只要您能够轻松更换故障的硬件。然而，在大规模系统中，硬件故障发生得足够频繁，以至于它们成为正常系统操作的一部分。

#### 通过冗余容忍硬件故障

我们对不可靠硬件的第一反应通常是为单个硬件组件增加冗余，以降低系统的故障率。磁盘可以设置为 RAID 配置（将数据分散到同一机器上的多个磁盘上，以便故障磁盘不会导致数据丢失），服务器可能配备双电源和热插拔 CPU，数据中心可能有电池和柴油发电机作为备用电源。这种冗余通常可以使机器连续运行多年而不间断。

冗余在组件故障独立时最为有效，也就是说，一个故障的发生不会改变另一个故障发生的可能性。然而，经验表明，组件故障之间往往存在显著的相关性 [40, 54, 55]；整个服务器机架或整个数据中心的不可用性仍然比我们希望的要频繁。

硬件冗余提高了单台机器的正常运行时间；然而，正如在“分布式与单节点系统”中讨论的那样，使用分布式系统有其优势，例如能够容忍一个数据中心的完全停机。因此，云系统往往不太关注单台机器的可靠性，而是旨在通过在软件层面容忍故障节点来实现服务的高可用性。云服务提供商使用可用性区域来识别哪些资源是物理上共置的；同一地点的资源比地理上分离的资源更可能同时发生故障。

本书中讨论的容错技术旨在容忍整个机器、机架或可用区的丢失。它们通常通过允许一个数据中心中的机器在另一个数据中心中的机器发生故障或变得不可达时接管来工作。我们将在第 6 章中讨论这些容错技术，以及本书的其他多个部分。

能够容忍整个机器丢失的系统也具有操作上的优势：如果需要重启机器（例如，应用操作系统安全补丁），单服务器系统需要计划停机，而多节点容错系统可以通过一次重启一个节点来进行补丁更新，而不会影响用户的服务。这被称为滚动升级，我们将在第 5 章中进一步讨论。

#### 软件故障

尽管硬件故障可能存在弱相关性，但它们仍然大多是独立的：例如，如果一个磁盘故障，其他同一台机器上的磁盘在一段时间内很可能会正常工作。另一方面，软件故障往往高度相关，因为许多节点运行相同的软件，因此会出现相同的错误 [ 56, 57]。这种故障更难以预测，并且往往导致比不相关的硬件故障更多的系统故障 [46]。例如：

- 一个软件错误导致每个节点在特定情况下同时故障。例如，在 2012 年 6 月 30 日，由于 Linux 内核中的一个错误，一个闰秒导致许多 Java 应用程序同时挂起，导致许多互联网服务瘫痪 [58]。由于固件错误，某些型号的所有 SSD 在运行精确 32,768 小时（不到 4 年）后突然故障，使其上的数据无法恢复 [ 59]。

- 一个失控的进程消耗了一些共享的、有限的资源，例如 CPU 时间、内存、磁盘空间、网络带宽或线程 [60]。例如，在处理大请求时消耗过多内存的进程可能会被操作系统终止。客户端库中的一个错误可能导致请求量远高于预期 [61]。

- 系统依赖的服务变慢、变得无响应或开始返回损坏的响应。

- 不同系统之间的交互导致出现意外行为，而这种行为在每个系统单独测试时并不存在 [62]。

- 级联故障，其中一个组件的问题导致另一个组件过载并变慢，进而使另一个组件崩溃 [63, 64]。

导致这些软件故障的错误通常会潜伏很长时间，直到被一组不寻常的情况触发。在这些情况下，软件会显露出对其环境的某种假设——虽然这种假设通常是正确的，但由于某种原因，它最终会停止成立 [65, 66]。

解决软件中系统性故障的问题没有快速的解决方案。许多小措施可以有所帮助：仔细思考系统中的假设和交互；进行全面测试；进程隔离；允许进程崩溃并重启；避免重试风暴等反馈循环（参见“当过载系统无法恢复时”）；在生产环境中测量、监控和分析系统行为。

### 人类与可靠性

人类设计和构建软件系统，而维护这些系统运行的操作员也是人类。与机器不同，人类不仅仅遵循规则；他们的优势在于在完成工作时具有创造性和适应性。然而，这一特性也导致了不可预测性，有时即使出于良好的意图也会出现错误，从而导致失败。例如，一项关于大型互联网服务的研究发现，操作员的配置更改是导致停机的主要原因，而硬件故障（服务器或网络）仅占停机的 10%至 25% [67]。

将此类问题标记为“人为错误”是很诱人的，并希望通过更严格的程序和遵守规则来更好地控制人类行为，从而解决这些问题。然而，指责人们的错误是适得其反的。我们所称的“人为错误”并不是真正事件的原因，而是人们在努力工作时所处的社会技术系统中存在问题的症状 [68]。复杂系统往往具有涌现行为，其中组件之间的意外交互也可能导致失败 [69]。

各种技术措施可以帮助最小化人为错误的影响，包括全面测试（包括手动编写的测试和对大量随机输入的属性测试）[37]、快速恢复配置更改的回滚机制、新代码的逐步推出、详细清晰的监控、用于诊断生产问题的可观察性工具（参见“分布式系统的问题”）以及设计良好的接口，鼓励“正确的做法”，并抑制“错误的做法”。

然而，这些措施需要投入时间和金钱，在日常业务的务实现实中，组织往往优先考虑产生收入的活动，而不是增加对错误的抵御能力的措施。如果在更多功能和更多测试之间有选择，许多组织可以理解地选择功能。考虑到这一选择，当一个可避免的错误不可避免地发生时，指责犯错的人并没有意义——问题在于组织的优先事项。

越来越多的组织正在采用无责备的事后分析文化：在事件发生后，相关人员被鼓励分享发生的详细情况，而不必担心受到惩罚，因为这使得组织中的其他人能够学习如何防止未来发生类似问题 [70]。这个过程可能会揭示出需要改变业务优先级、需要投资于被忽视的领域、需要改变相关人员的激励措施，或者其他需要引起管理层注意的系统性问题。

作为一般原则，在调查事件时，您应该对简单的答案保持怀疑态度。“鲍勃在部署该变更时应该更加小心”并没有建设性，但“我们必须用 Haskell 重写后端”也同样没有意义。相反，管理层应该借此机会从每天与之打交道的人员的角度了解社会技术系统的运作细节，并根据这些反馈采取改进措施 [68]。

::: tip **可靠性有多重要？**
可靠性不仅仅适用于核电站和空中交通控制——更平常的应用也期望能够可靠地工作。商业应用中的错误会导致生产力损失（如果数据报告不正确，还会带来法律风险），而电子商务网站的停机则可能在收入损失和声誉损害方面造成巨大的成本。

在许多应用中，几分钟甚至几小时的临时停机是可以容忍的 [ 71]，但永久的数据丢失或损坏将是灾难性的。想象一下，一个家长将他们所有孩子的照片和视频存储在你的照片应用中 [ 72]。如果那个数据库突然损坏，他们会有什么感受？他们知道如何从备份中恢复吗？

作为另一个不可靠软件如何伤害人们的例子，考虑邮局 Horizon 丑闻。在 1999 年至 2019 年间，管理英国邮局分支的数百人因会计软件显示其账户存在短缺而被判定为盗窃或欺诈。最终，许多短缺显然是由于软件中的错误造成的，许多定罪也因此被推翻[73]。导致这一事件的，可能是英国历史上最大的不公正审判，的事实是，英国法律假设计算机正常运行（因此，计算机生成的证据是可靠的），除非有相反的证据[74]。软件工程师可能会嘲笑软件永远不会有错误的想法，但这对那些因不可靠的计算机系统而被错误监禁、宣告破产甚至自杀的人来说，几乎没有安慰。

在某些情况下，我们可能选择牺牲可靠性以降低开发成本（例如，在为一个未经验证的市场开发原型产品时）——但我们应该非常清楚何时在偷工减料，并牢记潜在的后果。
:::

## 可扩展性

即使一个系统今天运行可靠，也并不意味着它在未来一定会可靠地运行。性能下降的一个常见原因是负载增加：也许系统的并发用户从 10,000 人增长到 100,000 人，或者从 100 万增长到 1000 万。也许它正在处理比以前更大规模的数据。

可扩展性是我们用来描述一个系统应对增加负载能力的术语。有时，在讨论可扩展性时，人们会评论说：“你又不是谷歌或亚马逊。别担心规模，直接使用关系数据库就行。”这条格言是否适用于你，取决于你正在构建的应用类型。

如果你正在构建一个目前只有少量用户的新产品，可能是在一家初创公司，那么主要的工程目标通常是保持系统尽可能简单和灵活，以便在你对客户需求有更多了解时，能够轻松修改和调整产品的功能[75]。在这样的环境中，担心未来可能需要的假设规模是适得其反的：在最好的情况下，对可扩展性的投资是浪费的努力和过早的优化；在最坏的情况下，它们会让你陷入一个不灵活的设计，使得应用程序的演变变得更加困难。

原因在于，可扩展性并不是一个一维的标签：说“X 是可扩展的”或“Y 不具备可扩展性”是没有意义的。相反，讨论可扩展性意味着考虑以下问题：

- “如果系统以特定方式增长，我们有哪些应对增长的选项？”

- “我们如何增加计算资源以应对额外的负载？”

- “根据当前的增长预测，我们何时会达到当前架构的极限？”

如果你成功地让你的应用程序变得受欢迎，从而处理越来越多的负载，你将会了解到你的性能瓶颈在哪里，因此你将知道需要在哪些维度上进行扩展。到那时，就该开始关注可扩展性的技术了。

### 描述负载

首先，我们需要简明扼要地描述系统当前的负载；只有这样我们才能讨论增长问题（如果我们的负载翻倍会发生什么？）。通常这将是一个吞吐量的度量：例如，每秒对服务的请求数量、每天到达的新数据量（以千兆字节为单位）或每小时的购物车结账数量。有时你关心的是某个变量数量的峰值，例如在“案例研究：社交网络主页时间线”中同时在线用户的数量。

负载的其他统计特征通常也会影响访问模式，从而影响可扩展性要求。例如，您可能需要知道数据库中读取与写入的比例、缓存的命中率，或每个用户的数据项数量（例如，在社交网络案例研究中关注的关注者数量）。也许平均情况对您来说是重要的，或者您的瓶颈可能由少数极端情况主导。这一切都取决于您特定应用程序的细节。

一旦您描述了系统上的负载，就可以研究负载增加时会发生什么。您可以从两个方面来看待这个问题：

- 当您以某种方式增加负载并保持系统资源（CPU、内存、网络带宽等）不变时，系统的性能会受到怎样的影响？

- 当您以某种方式增加负载时，如果希望保持性能不变，您需要增加多少资源？

通常我们的目标是将系统的性能保持在 SLA 的要求范围内（见“响应时间指标的使用”），同时尽量降低系统运行的成本。所需的计算资源越多，成本就越高。某些类型的硬件可能比其他类型更具成本效益，而这些因素可能会随着新类型硬件的出现而变化。

如果你可以将资源加倍以处理两倍的负载，同时保持性能不变，我们称之为线性可扩展性，这被认为是一件好事。偶尔，由于规模经济或更好的峰值负载分配，处理两倍的负载可能只需要不到两倍的资源[76, 77]。更常见的情况是，成本增长速度快于线性增长，且可能有许多原因导致效率低下。例如，如果你有大量数据，那么处理单个写请求可能涉及的工作量会比你有少量数据时更多，即使请求的大小相同。

### 共享内存、共享磁盘和无共享架构

增加服务硬件资源的最简单方法是将其迁移到更强大的机器上。单个 CPU 核心的速度不再显著提高，但您可以购买一台（或租用一个云实例）具有更多 CPU 核心、更多 RAM 和更多磁盘空间的机器。这种方法称为垂直扩展或向上扩展。

您可以通过使用多个进程或线程在单台机器上实现并行性。属于同一进程的所有线程都可以访问相同的 RAM，因此这种方法也称为共享内存架构。共享内存方法的问题在于成本增长速度快于线性增长：一台高端机器的硬件资源是普通机器的两倍，通常价格会显著高于两倍。而且由于瓶颈，规模是两倍的机器往往无法处理两倍的负载。

另一种方法是共享磁盘架构，它使用几台具有独立 CPU 和 RAM 的机器，但将数据存储在一个共享的磁盘阵列中，这些机器通过快速网络连接：网络附加存储（NAS）或存储区域网络（SAN）。这种架构传统上用于本地数据仓库工作负载，但争用和锁定的开销限制了共享磁盘方法的可扩展性 [ 78 ]。

相比之下，共享无关架构 [ 79 ]（也称为水平扩展或扩展）获得了很大的普及。在这种方法中，我们使用一个分布式系统，具有多个节点，每个节点都有自己的 CPU、RAM 和磁盘。节点之间的任何协调都是通过常规网络在软件层面上完成的。

共享无状态的优点在于它具有线性扩展的潜力，可以使用任何提供最佳性价比的硬件（尤其是在云环境中），可以更容易地根据负载的增加或减少调整硬件资源，并且通过将系统分布在多个数据中心和区域中，可以实现更大的容错能力。缺点是它需要明确的分片（见第 7 章），并且会带来分布式系统的所有复杂性（[链接即将到来]）。

一些云原生数据库系统使用独立的服务来进行存储和事务执行（见“存储与计算的分离”），多个计算节点共享对同一存储服务的访问。该模型与共享磁盘架构有一些相似之处，但避免了旧系统的可扩展性问题：存储服务提供的是一个专门的 API，旨在满足数据库的特定需求，而不是提供文件系统（NAS）或块设备（SAN）抽象 [80]。

### 可扩展性的原则

在大规模运行的系统架构中，通常高度特定于应用程序——没有一种通用的、适合所有情况的可扩展架构（非正式地称为魔法扩展酱）。例如，一个设计用于处理每秒 100,000 个请求、每个请求大小为 1 kB 的系统，与一个设计用于处理每分钟 3 个请求、每个请求大小为 2 GB 的系统看起来截然不同——尽管这两个系统的数据吞吐量相同（100 MB/sec）。

此外，适合某一负载水平的架构不太可能应对 10 倍的负载。因此，如果您正在开发一个快速增长的服务，您很可能需要在每次负载增加一个数量级时重新考虑您的架构。由于应用程序的需求可能会不断演变，因此通常不值得提前规划超过一个数量级的未来扩展需求。

一个良好的可扩展性原则是将系统拆分为可以在很大程度上独立运行的小组件。这是微服务（参见“微服务与无服务器”）、分片（第 7 章）、流处理（[链接即将发布]）和无共享架构背后的基本原则。然而，挑战在于知道在哪里划定应该放在一起的事物和应该分开的事物之间的界限。关于微服务的设计指南可以在其他书籍中找到[81]，我们在第 7 章讨论无共享系统的分片。

另一个良好的原则是不要让事情变得比必要的更复杂。如果单机数据库能够完成工作，那么它可能比复杂的分布式设置更可取。自动扩展系统（根据需求自动添加或移除资源）很酷，但如果你的负载相对可预测，手动扩展的系统可能会有更少的操作意外（参见“操作：自动或手动重新平衡”）。拥有五个服务的系统比拥有五十个服务的系统更简单。良好的架构通常涉及务实的多种方法的混合。

## 可维护性

软件不会磨损或遭受材料疲劳，因此它不会像机械物体那样发生故障。但应用程序的需求经常变化，软件运行的环境也在变化（例如其依赖项和底层平台），并且它存在需要修复的错误。

人们普遍认为，软件的大部分成本并不在于其初始开发，而在于其持续维护——修复错误、保持系统运行、调查故障、将其适配到新平台、为新用例进行修改、偿还技术债务以及添加新功能 [82, 83]。

然而，维护也是困难的。如果一个系统已经成功运行了很长时间，它可能使用了许多今天不被很多工程师理解的过时技术（例如大型机和 COBOL 代码）；关于系统为何以某种方式设计的机构知识可能随着人员的离开而丧失；可能需要修复其他人的错误。此外，计算机系统通常与其支持的人类组织交织在一起，这意味着维护这些遗留系统既是一个技术问题，也是一个人际问题 [84]。

我们今天创建的每个系统，如果足够有价值以至于能够存活很长时间，终将成为一个遗留系统。为了尽量减少未来需要维护我们软件的后代所面临的痛苦，我们应该在设计时考虑维护问题。尽管我们无法总是预测哪些决策可能在未来造成维护上的麻烦，但在本书中，我们将关注几个广泛适用的原则：

**可操作性**
让组织能够轻松地保持系统的顺利运行。

**简单性**
通过使用易于理解的一致模式和结构来实现系统，使新工程师能够轻松理解系统，并避免不必要的复杂性。

**可演化性**
使工程师在未来能够轻松对系统进行更改，随着需求的变化，适应和扩展系统以应对未预见的用例。

### 可操作性：让运营变得简单

我们之前在“云时代的运营”中讨论了运营的角色，我们看到人类流程对于可靠的运营与软件工具同样重要。事实上，有人提出“良好的运营往往可以绕过糟糕（或不完整）软件的局限性，但良好的软件无法在糟糕的运营下可靠运行”[57]。

在由成千上万台机器组成的大规模系统中，手动维护将是极其昂贵的，因此自动化是必不可少的。然而，自动化可能是一把双刃剑：总会有一些边缘案例（例如罕见的故障场景）需要运营团队的手动干预。由于无法自动处理的案例通常是最复杂的问题，因此更高的自动化要求一个更有技能的运营团队来解决这些问题[85]。

此外，如果一个自动化系统出现故障，通常比依赖操作员手动执行某些操作的系统更难排除故障。因此，并不是说更多的自动化总是对可操作性更好。然而，适度的自动化是重要的，最佳平衡点将取决于您特定应用程序和组织的具体情况。

良好的可操作性意味着使日常任务变得简单，从而使运营团队能够将精力集中在高价值活动上。数据系统可以通过多种方式简化日常任务，包括 [86]：

- 允许监控工具检查系统的关键指标，并支持可观察性工具（参见“分布式系统的问题”）以提供系统运行时行为的洞察。各种商业和开源工具可以在这方面提供帮助 [87]。

- 避免对单个机器的依赖（允许在系统整体持续运行的同时对机器进行维护）

- 提供良好的文档和易于理解的操作模型（“如果我做 X，Y 将会发生”）

- 提供良好的默认行为，同时也给予管理员在需要时覆盖默认设置的自由

- 在适当的情况下实现自我修复，但在需要时也给予管理员对系统状态的手动控制

- 表现出可预测的行为，尽量减少意外情况

### 简单性：管理复杂性

小型软件项目可以拥有令人愉悦的简单和富有表现力的代码，但随着项目规模的扩大，它们往往变得非常复杂，难以理解。这种复杂性使得每个需要在系统上工作的人员都变得缓慢，从而进一步增加了维护成本。一个陷入复杂性的 software 项目有时被形容为一团糟 [88]。

当复杂性使得维护变得困难时，预算和时间表往往会超支。在复杂的软件中，进行更改时引入错误的风险也更大：当系统对开发人员来说更难以理解和推理时，隐藏的假设、意外的后果和意外的交互更容易被忽视 [66]。相反，减少复杂性可以大大提高软件的可维护性，因此简单性应该是我们构建系统的一个关键目标。

简单的系统更容易理解，因此我们应该尽量以最简单的方式解决给定的问题。不幸的是，这说起来容易，做起来难。某件事是否简单往往是一个主观的品味问题，因为没有客观的简单性标准 [89]。例如，一个系统可能在一个简单的接口后隐藏了复杂的实现，而另一个系统可能有一个简单的实现，但向用户暴露了更多的内部细节——哪个更简单呢？

对复杂性进行推理的一种尝试是将其分为两类：基本复杂性和偶然复杂性 [90]。这个想法是，基本复杂性是应用程序问题领域固有的，而偶然复杂性仅因我们工具的局限性而产生。不幸的是，这种区分也是有缺陷的，因为随着我们工具的发展，基本和偶然之间的界限会发生变化 [91]。

我们管理复杂性的最佳工具之一就是抽象。一个好的抽象可以在一个干净、易于理解的外表后隐藏大量的实现细节。一个好的抽象还可以用于广泛的不同应用。这种重用不仅比多次重新实现类似的东西更高效，而且还会导致更高质量的软件，因为抽象组件的质量改进惠及所有使用它的应用。

例如，高级编程语言就是一种抽象，它隐藏了机器代码、CPU 寄存器和系统调用。SQL 是一种抽象，它隐藏了复杂的磁盘和内存数据结构、来自其他客户端的并发请求以及崩溃后的不一致性。当然，当我们在高级语言中编程时，我们仍然在使用机器代码；我们只是不直接使用它，因为编程语言的抽象使我们不必考虑这些。

为了减少应用程序代码的复杂性，可以使用设计模式 [92] 和领域驱动设计 (DDD) [93] 等方法创建抽象。本书并不专注于这些特定于应用程序的抽象，而是关注于可以在其上构建应用程序的通用抽象，例如数据库事务、索引和事件日志。如果您想使用 DDD 等技术，可以在本书中描述的基础上实现它们。

### 可演化性：使改变更简单

您的系统需求永远保持不变的可能性极小。它们更可能处于不断变化之中：您会学习到新事实，之前未预见的用例出现，业务优先级发生变化，用户请求新功能，新平台取代旧平台，法律或监管要求变化，系统的增长迫使架构变更，等等。

在组织流程方面，敏捷工作模式提供了一个适应变化的框架。敏捷社区还开发了一些技术工具和流程，这些工具和流程在频繁变化的环境中开发软件时非常有帮助，例如测试驱动开发（TDD）和重构。在本书中，我们寻找在由多个具有不同特征的应用程序或服务组成的系统层面上提高敏捷性的方法。

您修改数据系统的难易程度，以及将其适应变化需求的能力，与其简单性和抽象程度密切相关：松耦合、简单的系统通常比紧耦合、复杂的系统更容易修改。由于这是一个非常重要的概念，我们将使用一个不同的词来指代数据系统层面的敏捷性：可演化性 [94]。

在大型系统中，使变更变得困难的一个主要因素是某些操作是不可逆的，因此这些操作需要非常谨慎地进行 [95]。例如，假设您正在从一个数据库迁移到另一个数据库：如果在新系统出现问题时无法切换回旧系统，那么风险就比可以轻松回退时要高得多。最小化不可逆性可以提高灵活性。

## 总结

在本章中，我们考察了几个非功能性需求的例子：性能、可靠性、可扩展性和可维护性。通过这些主题，我们还遇到了在本书其余部分中需要的原则和术语。我们从一个案例研究开始，探讨如何在社交网络中实现家庭时间线，这展示了在规模化时出现的一些挑战。

我们讨论了如何衡量性能（例如，使用响应时间百分位数）、系统负载（例如，使用吞吐量指标），以及它们在服务水平协议（SLA）中的应用。可扩展性是一个密切相关的概念：即确保在负载增长时性能保持不变。我们看到了一些可扩展性的一般原则，例如将任务分解为可以独立操作的小部分，我们将在接下来的章节中深入探讨可扩展性技术的详细内容。

为了实现可靠性，您可以使用容错技术，这使得系统即使在某些组件（例如，磁盘、机器或其他服务）出现故障时仍能继续提供服务。我们看到了一些可能发生的硬件故障示例，并将其与软件故障区分开来，因为软件故障通常更难处理，因为它们往往是高度相关的。实现可靠性的另一个方面是建立对人为错误的韧性，我们看到无责事后分析作为从事件中学习的一种技术。

最后，我们考察了可维护性的几个方面，包括支持运维团队的工作、管理复杂性以及使应用程序的功能随着时间的推移而易于演变。对于如何实现这些目标并没有简单的答案，但有一点可以帮助我们的是，使用经过充分理解的构建模块来构建应用程序，这些模块提供了有用的抽象。本书的其余部分将涵盖一些在实践中被证明有价值的构建模块。

## 参考

[1] Mike Cvet. How We Learned to Stop Worrying and Love Fan-In at Twitter. At QCon San Francisco, December 2016.

[2] Raffi Krikorian. Timelines at Scale. At QCon San Francisco, November 2012. Archived at perma.cc/V9G5-KLYK

[3] Twitter. Twitter’s Recommendation Algorithm. blog.twitter.com, March 2023. Archived at perma.cc/L5GT-229T

[4] Raffi Krikorian. New Tweets per second record, and how! blog.twitter.com, August 2013. Archived at perma.cc/6JZN-XJYN

[5] Samuel Axon. 3% of Twitter’s Servers Dedicated to Justin Bieber. mashable.com, September 2010. Archived at perma.cc/F35N-CGVX

[6] Nathan Bronson, Abutalib Aghayev, Aleksey Charapko, and Timothy Zhu. Metastable Failures in Distributed Systems. At Workshop on Hot Topics in Operating Systems (HotOS), May 2021. doi:10.1145/3458336.3465286

[7] Marc Brooker. Metastability and Distributed Systems. brooker.co.za, May 2021. Archived at perma.cc/7FGJ-7XRK

[8] Marc Brooker. Exponential Backoff And Jitter. aws.amazon.com, March 2015. Archived at perma.cc/R6MS-AZKH

[9] Marc Brooker. What is Backoff For? brooker.co.za, August 2022. Archived at perma.cc/PW9N-55Q5

[10] Michael T. Nygard. Release It!, 2nd Edition. Pragmatic Bookshelf, January 2018. ISBN: 9781680502398

[11] Frank Chen. Slowing Down to Speed Up – Circuit Breakers for Slack’s CI/CD. slack.engineering, August 2022. Archived at perma.cc/5FGS-ZPH3

[12] Marc Brooker. Fixing retries with token buckets and circuit breakers. brooker.co.za, February 2022. Archived at perma.cc/MD6N-GW26

[13] David Yanacek. Using load shedding to avoid overload. Amazon Builders’ Library, aws.amazon.com. Archived at perma.cc/9SAW-68MP

[14] Matthew Sackman. Pushing Back. wellquite.org, May 2016. Archived at perma.cc/3KCZ-RUFY

[15] Dmitry Kopytkov and Patrick Lee. Meet Bandaid, the Dropbox service proxy. dropbox.tech, March 2018. Archived at perma.cc/KUU6-YG4S

[16] Haryadi S. Gunawi, Riza O. Suminto, Russell Sears, Casey Golliher, Swaminathan Sundararaman, Xing Lin, Tim Emami, Weiguang Sheng, Nematollah Bidokhti, Caitie McCaffrey, Gary Grider, Parks M. Fields, Kevin Harms, Robert B. Ross, Andree Jacobson, Robert Ricci, Kirk Webb, Peter Alvaro, H. Birali Runesha, Mingzhe Hao, and Huaicheng Li. Fail-Slow at Scale: Evidence of Hardware Performance Faults in Large Production Systems. At 16th USENIX Conference on File and Storage Technologies, February 2018.

[17] Marc Brooker. Is the Mean Really Useless? brooker.co.za, December 2017. Archived at perma.cc/U5AE-CVEM
[ 17] Marc Brooker. 平均值真的没用吗？ brooker.co.za, 2017 年 12 月. 存档于 perma.cc/U5AE-CVEM

[18] Giuseppe DeCandia, Deniz Hastorun, Madan Jampani, Gunavardhan Kakulapati, Avinash Lakshman, Alex Pilchin, Swaminathan Sivasubramanian, Peter Vosshall, and Werner Vogels. Dynamo: Amazon’s Highly Available Key-Value Store. At 21st ACM Symposium on Operating Systems Principles (SOSP), October 2007. doi:10.1145/1294261.1294281

[19] Kathryn Whitenton. The Need for Speed, 23 Years Later. nngroup.com, May 2020. Archived at perma.cc/C4ER-LZYA

[20] Greg Linden. Marissa Mayer at Web 2.0. glinden.blogspot.com, November 2005. Archived at perma.cc/V7EA-3VXB

[21] Jake Brutlag. Speed Matters for Google Web Search. services.google.com, June 2009. Archived at perma.cc/BK7R-X7M2

[22] Eric Schurman and Jake Brutlag. Performance Related Changes and their User Impact. Talk at Velocity 2009.

[23] Akamai Technologies, Inc. The State of Online Retail Performance. akamai.com, April 2017. Archived at perma.cc/UEK2-HYCS

[24] Xiao Bai, Ioannis Arapakis, B. Barla Cambazoglu, and Ana Freire. Understanding and Leveraging the Impact of Response Latency on User Behaviour in Web Search. ACM Transactions on Information Systems, volume 36, issue 2, article 21, April 2018. doi:10.1145/3106372

[25] Jeffrey Dean and Luiz André Barroso. The Tail at Scale. Communications of the ACM, volume 56, issue 2, pages 74–80, February 2013. doi:10.1145/2408776.2408794

[26] Alex Hidalgo. Implementing Service Level Objectives: A Practical Guide to SLIs, SLOs, and Error Budgets. O’Reilly Media, September 2020. ISBN: 1492076813

[27] Jeffrey C. Mogul and John Wilkes. Nines are Not Enough: Meaningful Metrics for Clouds. At 17th Workshop on Hot Topics in Operating Systems (HotOS), May 2019. doi:10.1145/3317550.3321432

[28] Tamás Hauer, Philipp Hoffmann, John Lunney, Dan Ardelean, and Amer Diwan. Meaningful Availability. At 17th USENIX Symposium on Networked Systems Design and Implementation (NSDI), February 2020.

[29] Ted Dunning. The t-digest: Efficient estimates of distributions. Software Impacts, volume 7, article 100049, February 2021. doi:10.1016/j.simpa.2020.100049

[30] David Kohn. How percentile approximation works (and why it’s more useful than averages). timescale.com, September 2021. Archived at perma.cc/3PDP-NR8B

[31] Heinrich Hartmann and Theo Schlossnagle. Circllhist — A Log-Linear Histogram Data Structure for IT Infrastructure Monitoring. arxiv.org, January 2020.

[32] Charles Masson, Jee E. Rim, and Homin K. Lee. DDSketch: A Fast and Fully-Mergeable Quantile Sketch with Relative-Error Guarantees. Proceedings of the VLDB Endowment, volume 12, issue 12, pages 2195–2205, August 2019. doi:10.14778/3352063.3352135

[33] Baron Schwartz. Why Percentiles Don’t Work the Way You Think. solarwinds.com, November 2016. Archived at perma.cc/469T-6UGB

[34] Walter L. Heimerdinger and Charles B. Weinstock. A Conceptual Framework for System Fault Tolerance. Technical Report CMU/SEI-92-TR-033, Software Engineering Institute, Carnegie Mellon University, October 1992. Archived at perma.cc/GD2V-DMJW

[35] Felix C. Gärtner. Fundamentals of fault-tolerant distributed computing in asynchronous environments. ACM Computing Surveys, volume 31, issue 1, pages 1–26, March 1999. doi:10.1145/311531.311532

[36] Algirdas Avižienis, Jean-Claude Laprie, Brian Randell, and Carl Landwehr. Basic Concepts and Taxonomy of Dependable and Secure Computing. IEEE Transactions on Dependable and Secure Computing, volume 1, issue 1, January 2004. doi:10.1109/TDSC.2004.2

[37] Ding Yuan, Yu Luo, Xin Zhuang, Guilherme Renna Rodrigues, Xu Zhao, Yongle Zhang, Pranay U. Jain, and Michael Stumm. Simple Testing Can Prevent Most Critical Failures: An Analysis of Production Failures in Distributed Data-Intensive Systems. At 11th USENIX Symposium on Operating Systems Design and Implementation (OSDI), October 2014.

[38] Casey Rosenthal and Nora Jones. Chaos Engineering. O’Reilly Media, April 2020. ISBN: 9781492043867

[39] Eduardo Pinheiro, Wolf-Dietrich Weber, and Luiz Andre Barroso. Failure Trends in a Large Disk Drive Population. At 5th USENIX Conference on File and Storage Technologies (FAST), February 2007.

[40] Bianca Schroeder and Garth A. Gibson. Disk failures in the real world: What does an MTTF of 1,000,000 hours mean to you? At 5th USENIX Conference on File and Storage Technologies (FAST), February 2007.

[41] Andy Klein. Backblaze Drive Stats for Q2 2021. backblaze.com, August 2021. Archived at perma.cc/2943-UD5E

[42] Iyswarya Narayanan, Di Wang, Myeongjae Jeon, Bikash Sharma, Laura Caulfield, Anand Sivasubramaniam, Ben Cutler, Jie Liu, Badriddine Khessib, and Kushagra Vaid. SSD Failures in Datacenters: What? When? and Why? At 9th ACM International on Systems and Storage Conference (SYSTOR), June 2016. doi:10.1145/2928275.2928278

[43] Alibaba Cloud Storage Team. Storage System Design Analysis: Factors Affecting NVMe SSD Performance (1). alibabacloud.com, January 2019. Archived at archive.org

[44] Bianca Schroeder, Raghav Lagisetty, and Arif Merchant. Flash Reliability in Production: The Expected and the Unexpected. At 14th USENIX Conference on File and Storage Technologies (FAST), February 2016.

[45] Jacob Alter, Ji Xue, Alma Dimnaku, and Evgenia Smirni. SSD failures in the field: symptoms, causes, and prediction models. At International Conference for High Performance Computing, Networking, Storage and Analysis (SC), November 2019. doi:10.1145/3295500.3356172

[46] Daniel Ford, François Labelle, Florentina I. Popovici, Murray Stokely, Van-Anh Truong, Luiz Barroso, Carrie Grimes, and Sean Quinlan. Availability in Globally Distributed Storage Systems. At 9th USENIX Symposium on Operating Systems Design and Implementation (OSDI), October 2010.

[47] Kashi Venkatesh Vishwanath and Nachiappan Nagappan. Characterizing Cloud Computing Hardware Reliability. At 1st ACM Symposium on Cloud Computing (SoCC), June 2010. doi:10.1145/1807128.1807161

[48] Peter H. Hochschild, Paul Turner, Jeffrey C. Mogul, Rama Govindaraju, Parthasarathy Ranganathan, David E. Culler, and Amin Vahdat. Cores that don’t count. At Workshop on Hot Topics in Operating Systems (HotOS), June 2021. doi:10.1145/3458336.3465297

[49] Harish Dattatraya Dixit, Sneha Pendharkar, Matt Beadon, Chris Mason, Tejasvi Chakravarthy, Bharath Muthiah, and Sriram Sankar. Silent Data Corruptions at Scale. arXiv:2102.11245, February 2021.

[50] Diogo Behrens, Marco Serafini, Sergei Arnautov, Flavio P. Junqueira, and Christof Fetzer. Scalable Error Isolation for Distributed Systems. At 12th USENIX Symposium on Networked Systems Design and Implementation (NSDI), May 2015.

[51] Bianca Schroeder, Eduardo Pinheiro, and Wolf-Dietrich Weber. DRAM Errors in the Wild: A Large-Scale Field Study. At 11th International Joint Conference on Measurement and Modeling of Computer Systems (SIGMETRICS), June 2009. doi:10.1145/1555349.1555372

[52] Yoongu Kim, Ross Daly, Jeremie Kim, Chris Fallin, Ji Hye Lee, Donghyuk Lee, Chris Wilkerson, Konrad Lai, and Onur Mutlu. Flipping Bits in Memory Without Accessing Them: An Experimental Study of DRAM Disturbance Errors. At 41st Annual International Symposium on Computer Architecture (ISCA), June 2014. doi:10.5555/2665671.2665726

[53] Adrian Cockcroft. Failure Modes and Continuous Resilience. adrianco.medium.com, November 2019. Archived at perma.cc/7SYS-BVJP

[54] Shujie Han, Patrick P. C. Lee, Fan Xu, Yi Liu, Cheng He, and Jiongzhou Liu. An In-Depth Study of Correlated Failures in Production SSD-Based Data Centers. At 19th USENIX Conference on File and Storage Technologies (FAST), February 2021.

[55] Edmund B. Nightingale, John R. Douceur, and Vince Orgovan. Cycles, Cells and Platters: An Empirical Analysis of Hardware Failures on a Million Consumer PCs. At 6th European Conference on Computer Systems (EuroSys), April 2011. doi:10.1145/1966445.1966477

[56] Haryadi S. Gunawi, Mingzhe Hao, Tanakorn Leesatapornwongsa, Tiratat Patana-anake, Thanh Do, Jeffry Adityatama, Kurnia J. Eliazar, Agung Laksono, Jeffrey F. Lukman, Vincentius Martin, and Anang D. Satria. What Bugs Live in the Cloud? At 5th ACM Symposium on Cloud Computing (SoCC), November 2014. doi:10.1145/2670979.2670986

[57] Jay Kreps. Getting Real About Distributed System Reliability. blog.empathybox.com, March 2012. Archived at perma.cc/9B5Q-AEBW

[58] Nelson Minar. Leap Second Crashes Half the Internet. somebits.com, July 2012. Archived at perma.cc/2WB8-D6EU

[59] Hewlett Packard Enterprise. Support Alerts – Customer Bulletin a00092491en_us. support.hpe.com, November 2019. Archived at perma.cc/S5F6-7ZAC

[60] Lorin Hochstein. awesome limits. github.com, November 2020. Archived at perma.cc/3R5M-E5Q4

[61] Caitie McCaffrey. Clients Are Jerks: AKA How Halo 4 DoSed the Services at Launch & How We Survived. caitiem.com, June 2015. Archived at perma.cc/MXX4-W373

[62] Lilia Tang, Chaitanya Bhandari, Yongle Zhang, Anna Karanika, Shuyang Ji, Indranil Gupta, and Tianyin Xu. Fail through the Cracks: Cross-System Interaction Failures in Modern Cloud Systems. At 18th European Conference on Computer Systems (EuroSys), May 2023. doi:10.1145/3552326.3587448

[63] Mike Ulrich. Addressing Cascading Failures. In Betsy Beyer, Jennifer Petoff, Chris Jones, and Niall Richard Murphy (ed). Site Reliability Engineering: How Google Runs Production Systems. O’Reilly Media, 2016. ISBN: 9781491929124

[64] Harri Faßbender. Cascading failures in large-scale distributed systems. blog.mi.hdm-stuttgart.de, March 2022. Archived at perma.cc/K7VY-YJRX

[65] Richard I. Cook. How Complex Systems Fail. Cognitive Technologies Laboratory, April 2000. Archived at perma.cc/RDS6-2YVA

[66] David D. Woods. STELLA: Report from the SNAFUcatchers Workshop on Coping With Complexity. snafucatchers.github.io, March 2017. Archived at archive.org

[67] David Oppenheimer, Archana Ganapathi, and David A. Patterson. Why Do Internet Services Fail, and What Can Be Done About It? At 4th USENIX Symposium on Internet Technologies and Systems (USITS), March 2003.

[68] Sidney Dekker. The Field Guide to Understanding ‘Human Error’, 3rd Edition. CRC Press, November 2017. ISBN: 9781472439055

[69] Sidney Dekker. Drift into Failure: From Hunting Broken Components to Understanding Complex Systems. CRC Press, 2011. ISBN: 9781315257396

[70] John Allspaw. Blameless PostMortems and a Just Culture. etsy.com, May 2012. Archived at perma.cc/YMJ7-NTAP

[71] Itzy Sabo. Uptime Guarantees — A Pragmatic Perspective. world.hey.com, March 2023. Archived at perma.cc/F7TU-78JB

[72] Michael Jurewitz. The Human Impact of Bugs. jury.me, March 2013. Archived at perma.cc/5KQ4-VDYL

[73] Mark Halper. How Software Bugs led to ‘One of the Greatest Miscarriages of Justice’ in British History. Communications of the ACM, January 2025. doi:10.1145/3703779

[74] Nicholas Bohm, James Christie, Peter Bernard Ladkin, Bev Littlewood, Paul Marshall, Stephen Mason, Martin Newby, Steven J. Murdoch, Harold Thimbleby, and Martyn Thomas. The legal rule that computers are presumed to be operating correctly – unforeseen and unjust consequences. Briefing note, benthamsgaze.org, June 2022. Archived at perma.cc/WQ6X-TMW4

[75] Dan McKinley. Choose Boring Technology. mcfunley.com, March 2015. Archived at perma.cc/7QW7-J4YP
[ 75] Dan McKinley. 选择无聊的技术. mcfunley.com, 2015 年 3 月. 存档于 perma.cc/7QW7-J4YP

[76] Andy Warfield. Building and operating a pretty big storage system called S3. allthingsdistributed.com, July 2023. Archived at perma.cc/7LPK-TP7V

[77] Marc Brooker. Surprising Scalability of Multitenancy. brooker.co.za, March 2023. Archived at perma.cc/ZZD9-VV8T

[78] Ben Stopford. Shared Nothing vs. Shared Disk Architectures: An Independent View. benstopford.com, November 2009. Archived at perma.cc/7BXH-EDUR

[79] Michael Stonebraker. The Case for Shared Nothing. IEEE Database Engineering Bulletin, volume 9, issue 1, pages 4–9, March 1986.

[80] Panagiotis Antonopoulos, Alex Budovski, Cristian Diaconu, Alejandro Hernandez Saenz, Jack Hu, Hanuma Kodavalla, Donald Kossmann, Sandeep Lingam, Umar Farooq Minhas, Naveen Prakash, Vijendra Purohit, Hugh Qu, Chaitanya Sreenivas Ravella, Krystyna Reisteter, Sheetal Shrotri, Dixin Tang, and Vikram Wakade. Socrates: The New SQL Server in the Cloud. At ACM International Conference on Management of Data (SIGMOD), pages 1743–1756, June 2019. doi:10.1145/3299869.3314047

[81] Sam Newman. Building Microservices, second edition. O’Reilly Media, 2021. ISBN: 9781492034025

[82] Nathan Ensmenger. When Good Software Goes Bad: The Surprising Durability of an Ephemeral Technology. At The Maintainers Conference, April 2016. Archived at perma.cc/ZXT4-HGZB

[83] Robert L. Glass. Facts and Fallacies of Software Engineering. Addison-Wesley Professional, October 2002. ISBN: 9780321117427

[84] Marianne Bellotti. Kill It with Fire. No Starch Press, April 2021. ISBN: 9781718501188

[85] Lisanne Bainbridge. Ironies of automation. Automatica, volume 19, issue 6, pages 775–779, November 1983. doi:10.1016/0005-1098(83)90046-8

[86] James Hamilton. On Designing and Deploying Internet-Scale Services. At 21st Large Installation System Administration Conference (LISA), November 2007.

[87] Dotan Horovits. Open Source for Better Observability. horovits.medium.com, October 2021. Archived at perma.cc/R2HD-U2ZT

[88] Brian Foote and Joseph Yoder. Big Ball of Mud. At 4th Conference on Pattern Languages of Programs (PLoP), September 1997. Archived at perma.cc/4GUP-2PBV

[89] Marc Brooker. What is a simple system? brooker.co.za, May 2022. Archived at perma.cc/U72T-BFVE

[90] Frederick P. Brooks. No Silver Bullet – Essence and Accident in Software Engineering. In The Mythical Man-Month, Anniversary edition, Addison-Wesley, 1995. ISBN: 9780201835953

[91] Dan Luu. Against essential and accidental complexity. danluu.com, December 2020. Archived at perma.cc/H5ES-69KC

[92] Erich Gamma, Richard Helm, Ralph Johnson, and John Vlissides. Design Patterns: Elements of Reusable Object-Oriented Software. Addison-Wesley Professional, October 1994. ISBN: 9780201633610

[93] Eric Evans. Domain-Driven Design: Tackling Complexity in the Heart of Software. Addison-Wesley Professional, August 2003. ISBN: 9780321125217

[94] Hongyu Pei Breivold, Ivica Crnkovic, and Peter J. Eriksson. Analyzing Software Evolvability. at 32nd Annual IEEE International Computer Software and Applications Conference (COMPSAC), July 2008. doi:10.1109/COMPSAC.2008.50

[95] Enrico Zaninotto. From X programming to the X organisation. At XP Conference, May 2002. Archived at perma.cc/R9AR-QCKZ
