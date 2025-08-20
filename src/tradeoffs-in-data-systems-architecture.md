# 数据系统架构中的权衡

> 没有解决方案，只有权衡。 […] 但你要尽量获得最佳的权衡，这就是你所能期望的一切。
>
> 托马斯·索维尔，访谈与弗雷德·巴恩斯（2005）

数据在当今许多应用程序开发中占据中心地位。随着网络和移动应用程序、软件即服务（SaaS）以及云服务的出现，存储来自许多不同用户的数据在共享的基于服务器的数据基础设施中已成为常态。用户活动、商业交易、设备和传感器的数据需要被存储并使其可用于分析。当用户与应用程序互动时，他们既读取存储的数据，也生成更多数据。

小量数据可以存储和处理在单台机器上，通常相对容易处理。然而，随着数据量或查询速率的增长，数据需要分布在多台机器上，这带来了许多挑战。随着应用需求变得更加复杂，仅仅在一个系统中存储所有内容已不再足够，可能需要结合多个提供不同功能的存储或处理系统。

我们称一个应用为数据密集型应用，如果数据管理是开发该应用的主要挑战之一[1]。在计算密集型系统中，挑战在于并行化一些非常大的计算，而在数据密集型应用中，我们通常更关心存储和处理大数据量、管理数据变更、在面对故障和并发时确保一致性，以及确保服务的高可用性等问题。

此类应用通常由提供常用功能的标准构件构建。例如，许多应用需要：

- 存储数据，以便它们或其他应用可以在以后再次找到它（数据库）
- 记住昂贵操作的结果，以加快读取速度（缓存）
- 允许用户通过关键字搜索数据或以各种方式过滤数据（搜索索引）
- 尽快处理事件和数据变化（流处理）
- 定期处理大量积累的数据（批处理）

在构建应用程序时，我们通常会将多个软件系统或服务（例如数据库或 API）结合在一起，并用一些应用程序代码将它们粘合在一起。如果您正好在做数据系统设计的事情，那么这个过程可能会相当简单。

然而，随着您的应用程序变得更加雄心勃勃，挑战也随之而来。有许多具有不同特性的数据库系统，适用于不同的目的——您如何选择使用哪个？缓存有多种方法，构建搜索索引也有几种方式——您如何权衡它们的利弊？您需要弄清楚哪些工具和方法最适合当前的任务，当您需要做一些单一工具无法单独完成的事情时，结合工具可能会很困难。

本书是一本指南，帮助您决定使用哪些技术以及如何将它们结合起来。正如您将看到的，没有一种方法在根本上优于其他方法；每种方法都有其优缺点。通过本书，您将学会提出正确的问题，以评估和比较数据系统，从而找出哪种方法最能满足您特定应用的需求。

我们将通过查看数据在当今组织中通常如何使用的一些方式来开始我们的旅程。这里的许多想法源于企业软件（即大型组织（如大公司和政府）的软件需求和工程实践），因为历史上，只有大型组织拥有需要复杂技术解决方案的大数据量。如果您的数据量足够小，您可以简单地将其保存在电子表格中！然而，最近，小型公司和初创企业管理大数据量并构建数据密集型系统也变得越来越普遍。

数据系统面临的一个关键挑战是，不同的人需要对数据做出非常不同的处理。如果你在一家公司工作，你和你的团队会有一套优先事项，而另一个团队可能会有完全不同的目标，即使你们可能在使用相同的数据集！此外，这些目标可能并没有明确表达，这可能导致对正确方法的误解和分歧。

为了帮助你理解可以做出哪些选择，本章比较了几个对立的概念，并探讨了它们之间的权衡：

- 操作系统与分析系统之间的区别（“分析与操作系统”）；
- 云服务与自托管系统的利弊（“云与自托管”）；
- 何时从单节点系统转向分布式系统（“分布式与单节点系统”）；以及
- 平衡业务需求与用户权利（“数据系统、法律与社会”）。

此外，本章将为您提供我们在本书其余部分所需的术语。

::: tip 术语：前端和后端
本书中我们将讨论的许多内容与后端开发有关。为了说明这个术语：对于 web 应用程序，客户端代码（在 web 浏览器中运行）称为*前端*，而处理用户请求的服务器端代码被称为*后端*。移动应用程序类似于前端，因为它们提供用户界面，通常通过互联网与服务器端后端进行通信。前端有时在用户的设备上本地管理数据 [2]，但最大的数据信息基础设施挑战往往出现在后端：前端只需处理一个用户的数据，而后端则代表*所有*用户管理数据。

后端服务通常可以通过 HTTP（有时是 WebSocket）访问；它通常由一些应用程序代码组成，这些代码在一个或多个数据库中读取和写入数据，有时还与其他数据系统（如缓存或消息队列）接口（我们可以统称这些为*数据基础设施*）。应用程序代码通常是*无状态的*（即，当它完成处理一个 HTTP 请求时，它会忘记与该请求相关的所有信息），任何需要在一个请求和另一个请求之间持久化的信息需要存储在客户端或服务器端的数据基础设施中。
:::

## 分析系统与操作系统

如果您在企业中从事数据系统工作，您可能会遇到几种不同类型的数据工作者。第一种类型是*后端工程师*，他们构建处理读取和更新数据请求的服务；这些服务通常直接或间接地为外部用户提供服务（参见“微服务和无服务器”）。有时，这些服务是供组织内部其他部门使用的。

除了管理后端服务的团队外，通常还有两个其他群体需要访问组织的数据：业务分析师，他们生成关于组织活动的报告，以帮助管理层做出更好的决策（*商业智能*或*BI*），以及数据科学家，他们在数据中寻找新颖的见解，或创建由数据分析和机器学习/人工智能驱动的面向用户的产品功能（例如，电子商务网站上的“购买 X 的人也购买了 Y”推荐、风险评分或垃圾邮件过滤等预测分析，以及搜索结果的排名）。

尽管业务分析师和数据科学家倾向于使用不同的工具并以不同的方式操作，但他们有一些共同点：两者都进行*分析*，这意味着他们查看用户和后端服务生成的数据，但通常不修改这些数据（也许只是修正错误）。他们可能会创建派生数据集，其中原始数据以某种方式进行了处理。这导致了两种系统之间的分裂——这是我们在本书中将使用的一个区分：

- *操作系统*由后端服务和数据基础设施组成，数据在这里被创建，例如通过为外部用户提供服务。在这里，应用程序代码根据用户执行的操作读取和修改其数据库中的数据。

- *分析系统*满足业务分析师和数据科学家的需求。它们包含来自操作系统的只读数据副本，并针对分析所需的数据处理类型进行了优化。

正如我们将在下一节中看到的，操作系统和分析系统通常出于良好的原因而保持分离。随着这些系统的成熟，出现了两个新的专业角色：*数据工程师*和*分析工程师*。数据工程师是那些知道如何整合操作系统和分析系统的人，并对组织的数据基础设施承担更广泛的责任 [3]。分析工程师则对数据进行建模和转换，使其对组织中的业务分析师和数据科学家更有用 [4]。

许多工程师专注于操作或分析方面。然而，本书涵盖了操作和分析数据系统，因为两者在组织内数据生命周期中都扮演着重要角色。我们将深入探讨用于向内部和外部用户提供服务的数据基础设施，以便您能够更好地与另一方的同事合作。

### 描述事务处理和分析

在商业数据处理的早期阶段，写入数据库通常对应于商业交易的发生：进行销售、向供应商下订单、支付员工工资等。随着数据库扩展到不涉及金钱交易的领域，尽管如此，*事务*一词仍然保留，指的是形成逻辑单元的一组读写操作。

::: tip **注意**
第 8 章详细探讨了我们所说的事务。 本章宽泛地使用该术语，指的是低延迟的读写操作。
:::

尽管数据库开始用于许多不同类型的数据——社交媒体上的帖子、游戏中的动作、地址簿中的联系人等等——但基本的访问模式仍然类似于处理业务交易。一个操作系统通常通过某个键查找少量记录（这被称为*点查询*）。记录根据用户的输入被插入、更新或删除。由于这些应用是交互式的，这种访问模式被称为*在线事务处理*（OLTP）。

然而，数据库也开始越来越多地用于分析，这与 OLTP 相比具有非常不同的访问模式。通常，分析查询会扫描大量记录，并计算聚合统计数据（例如计数、总和或平均值），而不是将单个记录返回给用户。例如，超市连锁店的业务分析师可能想要回答以下分析查询：

- 我们每个商店在一月份的总收入是多少？

- 在我们最近的促销活动中，我们卖出了比平时多多少根香蕉？

- 哪个品牌的婴儿食品与品牌 X 的尿布最常一起购买？

这些类型查询所产生的报告对于商业智能非常重要，帮助管理层决定下一步该做什么。为了将这种使用数据库的模式与事务处理区分开来，它被称为*在线分析处理*（OLAP）[5]。OLTP 和分析之间的区别并不总是明确的，但一些典型特征列在表 1-1中。

**表 1-1. 操作系统与分析系统的特征比较**

|   **属性**   |      **操作系统（OLTP）**      |    **分析系统（OLAP）**    |
| :----------: | :----------------------------: | :------------------------: |
| 主要读取模式 |  点查询（通过键获取单个记录）  |     对大量记录进行聚合     |
| 主要写入模式 |    创建、更新和删除单个记录    |  批量导入（ETL）或事件流   |
| 人类用户示例 |     Web/移动应用的最终用户     |  内部分析师，用于决策支持  |
| 机器使用示例 |     检查某个操作是否被授权     |     检测欺诈/滥用模式      |
|   查询类型   | 固定的查询集，由应用程序预定义 |   分析师可以进行任意查询   |
|   数据表示   |  数据的最新状态（当前时间点）  | 随着时间推移发生的事件历史 |
|  数据集大小  |       从千兆字节到太字节       |      从太字节到拍字节      |

::: tip 注意
OLAP 中*在线*的含义不明确；它可能指的是查询不仅仅是为了预定义的报告，而是分析师使用 OLAP 系统进行交互式探索查询。
:::

在操作系统中，用户通常不被允许构建自定义 SQL 查询并在数据库上运行，因为这可能会让他们读取或修改他们没有权限访问的数据。此外，他们可能会编写执行成本高昂的查询，从而影响其他用户的数据库性能。出于这些原因，OLTP 系统通常运行一组固定的查询，这些查询被嵌入到应用程序代码中，仅偶尔使用一次性自定义查询进行维护或故障排除。另一方面，分析数据库通常允许用户自由手动编写任意 SQL 查询，或使用数据可视化或仪表板工具（如 Tableau、Looker 或 Microsoft Power BI）自动生成查询。

还有一种系统是专为分析工作负载（对许多记录进行聚合的查询）设计的，但它们嵌入在面向用户的产品中。这一类别被称为*产品分析*或*实时分析*，专为这种用途设计的系统包括 Pinot、Druid 和 ClickHouse [6]。

## 数据仓库

起初，同一个数据库会被用于事务处理和分析查询。在这方面，SQL 被证明是相当灵活的：它对这两种类型的查询都能很好地工作。然而，在 1980 年代末和 1990 年代初，企业逐渐停止使用其 OLTP 系统进行分析，而是选择在一个单独的数据库系统上进行分析。这个单独的数据库被称为*数据仓库*。

一个大型企业可能拥有数十个甚至数百个在线事务处理系统：这些系统为面向客户的网站提供支持，控制实体店的销售点（结账）系统，跟踪仓库中的库存，规划车辆的路线，管理供应商，管理员工，以及执行许多其他任务。每个系统都很复杂，需要一个团队来维护，因此这些系统最终大多独立运行。

出于几个原因，业务分析师和数据科学家通常不希望直接查询这些 OLTP 系统：

- 感兴趣的数据可能分散在多个操作系统中，这使得在单个查询中组合这些数据集变得困难（这个问题被称为*数据孤岛*）；

- 适合 OLTP 的模式和数据布局不太适合分析（参见“星型和雪花：分析的模式”）；

- 分析查询可能非常昂贵，在 OLTP 数据库上运行它们会影响其他用户的性能；而

- OLTP 系统可能位于一个用户因安全或合规原因不允许直接访问的独立网络中。

相比之下，*数据仓库*是一个独立的数据库，分析师可以随心所欲地查询，而不会影响 OLTP 操作 [7]。正如我们将在第 4 章中看到的，数据仓库通常以与 OLTP 数据库非常不同的方式存储数据，以优化分析中常见的查询类型。

数据仓库包含公司所有各种 OLTP 系统中数据的只读副本。数据从 OLTP 数据库中提取（使用定期数据转储或持续更新流），转换为适合分析的模式，清理后再加载到数据仓库中。将数据导入数据仓库的过程称为*提取-转换-加载*（ETL），如图 1-1 所示。有时，*转换*和*加载*步骤的顺序会被调换（即，转换在数据仓库中完成，加载后进行），这被称为 *ELT*。

![ddia_0101](/ddia/ddia_0101.png)
**图 1-1. ETL 进入数据仓库的简化概述。**

在某些情况下，ETL 过程的数据源是外部 SaaS 产品，例如客户关系管理 (CRM)、电子邮件营销或信用卡处理系统。在这些情况下，您无法直接访问原始数据库，因为它只能通过软件供应商的 API 访问。将这些外部系统中的数据引入您自己的数据仓库，可以实现通过 SaaS API 无法进行的分析。SaaS API 的 ETL 通常由专门的数据连接服务实现，例如 Fivetran、Singer 或 AirByte。

一些数据库系统提供*混合事务/分析处理* (HTAP)，旨在使 OLTP 和分析在单一系统中实现，而无需将数据从一个系统 ETL 到另一个系统 [8] [9]。然而，许多 HTAP 系统内部实际上由一个 OLTP 系统与一个单独的分析系统结合而成，这两个系统隐藏在一个共同的接口后面——因此，理解这两者之间的区别对于理解这些系统的工作原理仍然很重要。

此外，尽管存在 HTAP，但由于其不同的目标和需求，事务系统和分析系统之间的分离是很常见的。特别是，通常认为每个操作系统拥有自己的数据库是一种良好实践（见“微服务和无服务器”），这导致了数百个独立的操作数据库；另一方面，企业通常只有一个数据仓库，以便业务分析师可以在单个查询中结合来自多个操作系统的数据。

因此，HTAP 并不取代数据仓库。相反，它在需要同一应用程序同时执行分析查询（扫描大量行）和以低延迟读取和更新单个记录的场景中非常有用。例如，欺诈检测可能涉及这样的工作负载[10]。

操作系统和分析系统之间的分离是一个更广泛趋势的一部分：随着工作负载变得更加苛刻，系统变得更加专业化，并针对特定工作负载进行了优化。通用系统可以轻松处理小数据量，但规模越大，系统往往越专业化 [11]。

### 从数据仓库到数据湖

数据仓库通常使用关系数据模型，通过 SQL 进行查询（见第 3 章），可能还会使用专门的商业智能软件。这个模型适合商业分析师需要进行的查询类型，但对于数据科学家的需求则不太适合，他们可能需要执行以下任务：

- 将数据转换为适合训练机器学习模型的形式；通常这需要将数据库表的行和列转换为称为*特征*的数值向量或矩阵。以最大化训练模型性能的方式执行这种转换的过程称为*特征工程*，这通常需要自定义代码，而用 SQL 表达起来则比较困难。

- 处理文本数据（例如，产品评论），并使用自然语言处理技术尝试从中提取结构化信息（例如，作者的情感或他们提到的主题）。同样，他们可能需要使用计算机视觉技术从照片中提取结构化信息。

尽管已经有努力将机器学习操作符添加到 SQL 数据模型中[12]，并在关系基础上构建高效的机器学习系统[13]，但许多数据科学家更倾向于不在关系数据库（如数据仓库）中工作。相反，许多人更喜欢使用 Python 数据分析库，如 pandas 和 scikit-learn，统计分析语言，如 R，以及分布式分析框架，如 Spark[14]。我们将在“数据框、矩阵和数组”中进一步讨论这些内容。

因此，组织面临着将数据以适合数据科学家使用的形式提供的需求。解决方案是*数据湖*：一个集中式的数据存储库，保存任何可能对分析有用的数据副本，这些数据通过 ETL 过程从操作系统获取。与数据仓库的不同之处在于，数据湖仅包含文件，而不强加任何特定的文件格式或数据模型。数据湖中的文件可能是数据库记录的集合，使用如 Avro 或 Parquet 等文件格式编码（见第 5 章），但它们同样可以包含文本、图像、视频、传感器读数、稀疏矩阵、特征向量、基因组序列或任何其他类型的数据[15]。除了更灵活之外，这通常也比关系数据存储便宜，因为数据湖可以使用商品化的文件存储，如对象存储（见[云原生系统架构](#云原生系统架构)）。

ETL 过程已被概括为*数据管道*，在某些情况下，数据湖已成为从操作系统到数据仓库的中间停靠点。数据湖包含由操作系统生成的“原始”数据，而没有转化为关系数据仓库模式。这种方法的优点在于每个数据消费者可以将原始数据转化为最符合其需求的形式。这被称为*寿司原则*：“原始数据更好” [16]。

除了将数据从数据湖加载到单独的数据仓库外，还可以直接在数据湖中的文件上运行典型的数据仓库工作负载（SQL 查询和商业分析），以及数据科学/机器学习工作负载。这种架构被称为*数据湖*，它需要一个查询执行引擎和一个扩展数据湖文件存储的元数据（例如，模式管理）层 [17]。Apache Hive、Spark SQL、Presto 和 Trino 是这种方法的例子。

### 超越数据湖

随着分析实践的成熟，组织越来越关注分析系统和数据管道的管理和运营，例如在 DataOps 宣言中所体现的内容[18]。其中涉及到治理、隐私和遵守 GDPR 和 CCPA 等法规的问题，我们将在[数据系统、法律与社会](#数据系统法律与社会)中讨论这些问题，并提供相关链接。

此外，分析数据不仅以文件和关系表的形式提供，还越来越多地以事件流的形式提供（见相关链接）。通过基于文件的数据分析，您可以定期（例如，每天）重新运行分析，以响应数据的变化，但流处理允许分析系统在几秒钟内更快地响应事件。根据应用程序及其对时间的敏感性，流处理方法可以非常有价值，例如用于识别和阻止潜在的欺诈或滥用活动。

在某些情况下，分析系统的输出会提供给操作系统（这个过程有时被称为*反向* ETL [19]）。例如，一个在分析系统中训练的机器学习模型可以被部署到生产环境中，以便为最终用户生成推荐，例如“购买 X 的人也购买了 Y”。这种部署的分析系统输出也被称为*数据产品* [20]。机器学习模型可以使用专门的工具如 TFX、Kubeflow 或 MLflow 部署到操作系统中。

### 记录系统与派生数据

与操作系统和分析系统之间的区别相关，本书还区分了记录系统和派生数据系统。这些术语很有用，因为它们可以帮助您澄清数据在系统中的流动：

#### 记录系统

记录系统，也称为真相来源，保存某些数据的权威或规范版本。当新数据到达时，例如作为用户输入，它首先被写入这里。每个事实仅表示一次（表示通常是*规范化的*；参见[规范化、反规范化和连接](data-models-and-query-languages.md#规范化反规范化和连接)）。如果另一个系统与记录系统之间存在任何差异，则记录系统中的值（根据定义）是正确的。

#### 派生数据系统

派生系统中的数据是从另一个系统中提取一些现有数据并以某种方式进行转换或处理的结果。如果您丢失了派生数据，可以从原始来源重新创建它。一个经典的例子是缓存：如果缓存中存在数据，可以从缓存中提供数据，但如果缓存不包含您所需的内容，您可以回退到基础数据库。反规范化值、索引、物化视图、转换的数据表示以及在数据集上训练的模型也属于这一类别。

从技术上讲，派生数据是冗余的，因为它重复了现有的信息。然而，它通常对于提高读取查询的性能至关重要。您可以从单一来源派生出多个不同的数据集，使您能够从不同的“视角”查看数据。

分析系统通常是派生数据系统，因为它们是从其他地方创建的数据的消费者。操作服务可能包含记录系统和派生数据系统的混合。记录系统是数据首次写入的主要数据库，而派生数据系统则是加速常见读取操作的索引和缓存，特别是对于记录系统无法高效回答的查询。

大多数数据库、存储引擎和查询语言本质上并不是记录系统或派生系统。数据库只是一个工具：您如何使用它取决于您自己。记录系统和派生数据系统之间的区别并不在于工具，而在于您在应用程序中如何使用它。通过明确哪些数据是从其他数据派生的，您可以为本来令人困惑的系统架构带来清晰度。

当一个系统中的数据源自另一个系统的数据时，当记录系统中的原始数据发生变化时，您需要一个更新派生数据的过程。不幸的是，许多数据库的设计假设您的应用程序只需要使用那一个数据库，因此它们并不容易集成多个系统以传播此类更新。在[链接即将发布]中，我们将讨论数据集成的方法，这些方法允许我们组合多个数据系统，以实现单一系统无法完成的任务。

这使我们结束了对分析和事务处理的比较。在下一部分，我们将研究您可能已经看到多次辩论的另一个权衡。

## 云计算与自托管

对于组织需要做的任何事情，第一个问题之一是：应该在内部完成，还是应该外包？您是应该自己构建还是购买？

最终，这个问题涉及到商业优先级。普遍接受的管理智慧是，作为核心竞争力或竞争优势的事务应该在内部完成，而非核心、常规或普遍的事务则应交给供应商处理 [21]。举个极端的例子，大多数公司并不自己发电（除非它们是能源公司，并且不考虑紧急备用电源），因为从电网购买电力更便宜。

在软件方面，需要做出的两个重要决策是由谁来构建软件以及由谁来部署它。每个决策外包的可能性存在一个范围，如图 1-2 所示。在一个极端是您自己编写和运行的定制软件；在另一个极端是由外部供应商实施和运营的广泛使用的云服务或软件即服务（SaaS）产品，您只能通过网络界面或 API 访问它们。

![ddia-0102](/ddia/ddia_0102.png)

**图 1-2. 软件及其操作类型的范围。**

中间的选择是现成的软件（开源或商业），你可以自我托管，也就是说，由你自己部署——例如，如果你下载 MySQL 并将其安装在你控制的服务器上。这可以是在你自己的硬件上（通常称为本地部署，即使服务器实际上是在租用的数据中心机架上，而不是真正位于你自己的场所），或者是在云中的虚拟机上（基础设施即服务或 IaaS）。在这个范围内还有更多的选择，例如，使用开源软件并运行其修改版本。

与这个范围分开，还有一个问题是你如何部署服务，无论是在云中还是本地——例如，你是否使用像 Kubernetes 这样的编排框架。然而，部署工具的选择超出了本书的范围，因为其他因素对数据系统的架构有更大的影响。

### 云服务的优缺点

使用云服务，而不是自己运行类似的软件，实际上是将该软件的操作外包给云服务提供商。关于云服务，有很多支持和反对的论点。云服务提供商声称，使用他们的服务可以节省时间和金钱，并且与建立自己的基础设施相比，可以更快地推进。

云服务是否真的比自我托管更便宜和更容易，很大程度上取决于你的技能和系统上的工作负载。如果你已经有设置和操作所需系统的经验，并且你的负载相当可预测（即，你需要的机器数量不会剧烈波动），那么通常购买自己的机器并在上面自己运行软件会更便宜 [ 22, 23]。

另一方面，如果您需要一个您尚不熟悉如何部署和操作的系统，那么采用云服务通常比自己学习管理系统更容易和更快捷。如果您必须专门雇佣和培训员工来维护和操作该系统，这可能会非常昂贵。在使用云服务时，您仍然需要一个运营团队（请参见“云时代的运营”），但外包基本的系统管理可以让您的团队专注于更高层次的事务。

当您将系统的操作外包给一家专门提供该服务的公司时，可能会得到更好的服务，因为提供商通过为许多客户提供服务而获得了运营专业知识。相反，如果您自己运行该服务，您可以根据特定的工作负载进行配置和调优；云服务不太可能愿意代表您进行这样的定制。

如果您的系统负载随时间变化很大，云服务特别有价值。如果您配置机器以处理峰值负载，但这些计算资源大部分时间处于闲置状态，那么系统的成本效益就会降低。在这种情况下，云服务的优势在于它们可以更容易地根据需求变化来扩展或缩减计算资源。

例如，分析系统的负载通常非常不稳定：快速运行大型分析查询需要大量并行计算资源，但一旦查询完成，这些资源就会闲置，直到用户发出下一个查询。预定义查询（例如，日报告）可以排队并调度以平滑负载，但对于交互式查询，您希望它们完成得越快，工作负载就变得越不稳定。如果您的数据集大到快速查询需要显著的计算资源，使用云可以节省成本，因为您可以将未使用的资源返还给提供商，而不是让它们闲置。对于较小的数据集，这种差异就不那么显著。

云服务最大的缺点是你无法控制它：

- 如果缺少你需要的功能，你能做的就是礼貌地询问供应商是否会添加该功能；通常你无法自己实现它。

- 如果服务出现故障，你能做的就是等待它恢复。

- 如果你使用服务的方式触发了错误或导致性能问题，诊断问题将会很困难。对于你自己运行的软件，你可以从操作系统获取性能指标和调试信息，以帮助你理解其行为，并且可以查看服务器日志，但对于供应商托管的服务，你通常无法访问这些内部信息。

- 此外，如果服务关闭或变得异常地昂贵，或者如果供应商决定以你不喜欢的方式更改他们的产品，你就只能听任他们的摆布——继续运行旧版本的软件通常不是一个选项，因此你将被迫迁移到替代服务 [24]。如果有替代服务提供兼容的 API，这种风险会有所降低，但对于许多云服务来说，并没有标准的 API，这提高了切换的成本，使得供应商绑定成为一个问题。

- 云服务提供商需要被信任以保持数据安全，这可能会使遵守隐私和安全法规的过程变得复杂。

尽管存在所有这些风险，越来越多的组织选择在云服务之上构建新应用程序，或采用混合方法，在系统的某些方面使用云服务。然而，云服务并不会取代所有内部数据系统：许多旧系统是在云出现之前就存在的，对于任何现有云服务无法满足的专业需求，内部系统仍然是必要的。例如，像高频交易这样的延迟敏感型应用程序需要对硬件的完全控制。

### 云原生系统架构

除了拥有不同的经济模型（订阅服务而不是购买硬件和为其授权软件），云的兴起还对数据系统在技术层面的实现产生了深远的影响。云原生一词用于描述旨在利用云服务的架构。

原则上，几乎任何可以自我托管的软件都可以作为云服务提供，实际上，许多流行的数据系统现在都提供了这样的托管服务。然而，从一开始就设计为云原生的系统显示出几个优势：在相同硬件上更好的性能、更快的故障恢复、能够快速扩展计算资源以匹配负载，以及支持更大的数据集 [25, 26, 27]。表 1-2 列出了一些这两种类型系统的示例。

*表 1-2. 自我托管和云原生数据库系统的示例*

|     **类别**      |      **自我托管系统**       |                           **云原生系统**                            |
| :---------------: | :-------------------------: | :-----------------------------------------------------------------: |
| 操作/在线事务处理 | MySQL, PostgreSQL, MongoDB  | AWS Aurora [25], Azure SQL DB Hyperscale [26], Google Cloud Spanner |
|    分析型/OLAP    | Teradata, ClickHouse, Spark |      Snowflake [27], Google BigQuery, Azure Synapse Analytics       |

#### 云服务的分层

许多自托管的数据系统具有非常简单的系统要求：它们运行在传统的操作系统上，如 Linux 或 Windows，数据以文件的形式存储在文件系统中，并通过标准网络协议（如 TCP/IP）进行通信。少数系统依赖于特殊硬件，如 GPU（用于机器学习）或 RDMA 网络接口，但总体而言，自托管软件往往使用非常通用的计算资源：CPU、RAM、文件系统和 IP 网络。

在云环境中，这类软件可以在基础设施即服务（Infrastructure-as-a-Service）环境中运行，使用一个或多个虚拟机（或实例），并分配一定的 CPU、内存、磁盘和网络带宽。与物理机器相比，云实例的配置速度更快，且可用的尺寸种类更多，但在其他方面它们与传统计算机相似：你可以在上面运行任何你喜欢的软件，但你需要自己负责管理。

相比之下，云原生服务的关键理念是不仅使用由操作系统管理的计算资源，还要基于更低级的云服务构建更高级的服务。例如：

- 对象存储服务如 Amazon S3、Azure Blob Storage 和 Cloudflare R2 用于存储大文件。它们提供的 API 比典型的文件系统更有限（基本的文件读取和写入），但它们的优势在于隐藏了底层的物理机器：该服务会自动将数据分布在多台机器上，因此您不必担心某台机器的磁盘空间不足。即使某些机器或其磁盘完全故障，也不会丢失任何数据。

- 许多其他服务又建立在对象存储和其他云服务之上：例如，Snowflake 是一个基于云的分析数据库（数据仓库），依赖 S3 进行数据存储 [27]，而其他一些服务又建立在 Snowflake 之上。

在计算中的抽象总是如此，没有一个正确的答案来决定你应该使用什么。一般来说，高级抽象往往更倾向于特定的用例。如果你的需求与高级系统设计的情况相匹配，使用现有的高级系统可能会比从低级系统自己构建要轻松得多，能够提供你所需的功能。另一方面，如果没有满足你需求的高级系统，那么从低级组件自己构建就是唯一的选择。

#### 存储与计算的分离

在传统计算中，磁盘存储被视为持久的（我们假设一旦某些数据被写入磁盘，就不会丢失）；为了容忍单个硬盘的故障，通常使用 RAID 在多个磁盘上维护数据的副本。在云计算中，计算实例（虚拟机）也可能附带本地磁盘，但云原生系统通常将这些磁盘视为短暂的缓存，而不是长期存储。这是因为如果关联的实例失败，或者为了适应负载变化而用更大或更小的实例（在不同的物理机器上）替换该实例，本地磁盘将变得不可访问。

作为本地磁盘的替代方案，云服务还提供虚拟磁盘存储，可以从一个实例中分离并附加到另一个实例（如 Amazon EBS、Azure 托管磁盘和 Google Cloud 中的持久磁盘）。这样的虚拟磁盘实际上并不是物理磁盘，而是由一组独立的机器提供的云服务，模拟磁盘的行为（一个块设备，每个块的大小通常为 4 KiB）。这项技术使得在云中运行传统的基于磁盘的软件成为可能，但块设备的仿真引入了在从头开始为云设计的系统中可以避免的开销[25]。它还使得应用程序对网络故障非常敏感，因为虚拟块设备上的每个 I/O 实际上都是一个网络调用。

为了解决这个问题，云原生服务通常避免使用虚拟磁盘，而是基于专门为特定工作负载优化的存储服务。像 S3 这样的对象存储服务旨在长期存储相对较大的文件，文件大小范围从几百千字节到几千兆字节。存储在数据库中的单个行或值通常要小得多；因此，云数据库通常在单独的服务中管理较小的值，并在对象存储中存储较大的数据块（包含许多个体值）[26, 28]。我们将在第 4 章中看到实现这一点的方法。

在传统的系统架构中，同一台计算机负责存储（磁盘）和计算（CPU 和 RAM），但在云原生系统中，这两项职责已经在某种程度上分离或解耦[9, 27, 29, 30]：例如，S3 仅存储文件，如果您想分析这些数据，您必须在 S3 之外的某个地方运行分析代码。这意味着需要通过网络传输数据，我们将在“分布式与单节点系统”中进一步讨论这一点。

此外，云原生系统通常是多租户的，这意味着不同客户的数据和计算在同一共享硬件上由同一服务处理，而不是为每个客户提供单独的机器[31]。多租户可以实现更好的硬件利用率、更容易的可扩展性以及云服务提供商更容易的管理，但这也需要仔细的工程设计，以确保一个客户的活动不会影响其他客户的系统性能或安全性[32]。

### 云时代的运营

传统上，管理组织服务器端数据基础设施的人被称为数据库管理员（DBA）或系统管理员（sysadmin）。最近，许多组织尝试将软件开发和运营的角色整合到一个团队中，共同负责后端服务和数据基础设施；DevOps 理念引导了这一趋势。站点可靠性工程师（SRE）是谷歌对这一理念的实现[33]。

运营的角色是确保服务可靠地交付给用户（包括配置基础设施和部署应用程序），并确保生产环境的稳定（包括监控和诊断可能影响可靠性的问题）。对于自托管系统，运营传统上涉及大量针对单个机器的工作，例如容量规划（例如，监控可用磁盘空间并在空间用尽之前添加更多磁盘）、配置新机器、将服务从一台机器迁移到另一台机器，以及安装操作系统补丁。

许多云服务提供一个 API，隐藏了实际实现服务的单个机器。例如，云存储用计量计费替代了固定大小的磁盘，您可以在不提前规划容量需求的情况下存储数据，然后根据实际使用的空间收费。此外，许多云服务在单个机器发生故障时仍然保持高度可用（参见[可靠性和容错性](defining-nonfunctional-requirements.md#可靠性和容错性)）。

这种从单个机器到服务的重点转变伴随着运维角色的变化。提供可靠服务的高层目标保持不变，但流程和工具已经演变。DevOps/SRE 理念更加重视：

- 自动化——更倾向于可重复的流程而非手动的一次性工作，

- 更倾向于短暂的虚拟机和服务而非长时间运行的服务器，

- 支持频繁的应用更新，

- 从事件中学习，并且

- 在个体人员进出时，保留组织对系统的知识 [34]。

随着云服务的兴起，角色出现了分化：基础设施公司的运营团队专注于为大量客户提供可靠服务的细节，而服务的客户则尽可能少花时间和精力在基础设施上 [35]。

云服务的客户仍然需要进行操作，但他们关注的方面不同，例如选择最适合特定任务的服务、将不同服务进行集成以及从一个服务迁移到另一个服务。尽管计量计费消除了传统意义上对容量规划的需求，但了解您在使用哪些资源以及其用途仍然很重要，以免在不需要的云资源上浪费金钱：容量规划变成了财务规划，性能优化变成了成本优化[36]。此外，云服务确实有资源限制或*配额*（例如，您可以同时运行的最大进程数），您需要在遇到这些限制之前了解并进行规划[37]。

采用云服务可能比运行自己的基础设施更简单、更快捷，尽管在这里也需要花费时间学习如何使用它，并可能需要绕过其限制。随着越来越多的供应商提供针对不同用例的更广泛的云服务，不同服务之间的集成成为一个特别的挑战 [38, 39]。ETL（见[数据仓库](#数据仓库)）只是故事的一部分；操作云服务也需要相互集成。目前，缺乏能够促进这种集成的标准，因此通常需要大量的手动工作。

其他无法完全外包给云服务的操作方面包括维护应用程序及其使用的库的安全性，管理自己服务之间的交互，监控服务的负载，以及追踪性能下降或停机等问题的原因。虽然云正在改变操作的角色，但对操作的需求依然如故。

## 分布式与单节点系统

一个涉及多个机器通过网络进行通信的系统称为*分布式系统*。参与分布式系统的每个进程称为*节点*。您可能希望系统分布式的原因有很多：

**固有的分布式系统**
如果一个应用涉及两个或更多相互交互的用户，每个用户使用自己的设备，那么系统不可避免地是分布式的：设备之间的通信必须通过网络进行。

**云服务之间的请求**
如果数据存储在一个服务中但在另一个服务中处理，则必须通过网络将其从一个服务传输到另一个服务。

**容错/高可用性**
如果您的应用程序需要在一台机器（或多台机器，或网络，或整个数据中心）出现故障时继续工作，您可以使用多台机器来提供冗余。当一台机器故障时，另一台可以接管。请参见[可靠性和容错性](defining-nonfunctional-requirements.md#可靠性和容错性)以及[第 6 章](replication.md)关于复制的内容。

**可扩展性**
如果您的数据量或计算需求超过单台机器的处理能力，您可以考虑将负载分散到多台机器上。请参见[可扩展性](defining-nonfunctional-requirements.md#可扩展性)。

**延迟**
如果您在全球范围内有用户，您可能希望在全球各个地区设置服务器，以便每个用户都可以从地理位置接近他们的服务器获得服务。这可以避免用户等待网络数据包绕地球半圈来响应他们的请求。请参见[描述性能](defining-nonfunctional-requirements.md#描述性能)。

**弹性**
如果您的应用程序在某些时候繁忙而在其他时候闲置，云部署可以根据需求进行扩展或缩减，从而使您只需为实际使用的资源付费。这在单台机器上更为困难，因为它需要配置以处理最大负载，即使在几乎不使用的时候也是如此。

**使用专用硬件**
系统的不同部分可以利用不同类型的硬件来匹配其工作负载。例如，对象存储可能使用磁盘很多但 CPU 很少的机器，而数据分析系统可能使用 CPU 和内存很多但没有磁盘的机器，机器学习系统可能使用配备 GPU 的机器（GPU 在训练深度神经网络和其他机器学习任务时比 CPU 更高效）。

**法律合规**
一些国家有数据驻留法律，要求在其管辖范围内关于个人的数据必须在该国地理上存储和处理 [40]。这些规则的适用范围各不相同——例如，在某些情况下，它仅适用于医疗或财务数据，而在其他情况下则更为广泛。因此，拥有多个此类管辖区用户的服务将不得不在多个地点的服务器上分布其数据。

这些原因适用于您自己编写的服务（应用程序代码）和由现成软件（如数据库）组成的服务。

### 分布式系统的问题

分布式系统也有其缺点。每个通过网络发送的请求和 API 调用都需要处理失败的可能性：网络可能会中断，或者服务可能会过载或崩溃，因此任何请求可能会超时而未收到响应。在这种情况下，我们不知道服务是否收到了请求，简单地重试可能并不安全。我们将在[即将到来的链接]中详细讨论这些问题。

尽管数据中心网络很快，但调用另一个服务的速度仍然远远慢于在同一进程中调用一个函数 [41]。在处理大量数据时，与其将数据从存储转移到处理它的单独机器，不如将计算带到已经拥有数据的机器上更快 [42]。更多的节点并不总是意味着更快：在某些情况下，一个简单的单线程程序在一台计算机上的表现可能显著优于一个拥有超过 100 个 CPU 核心的集群 [43]。

排查分布式系统的问题通常很困难：如果系统响应缓慢，您如何确定问题出在哪里？用于诊断分布式系统问题的技术被称为可观察性 [44, 45]，这涉及收集有关系统执行的数据，并允许以可以分析高层指标和单个事件的方式进行查询。诸如 OpenTelemetry、Zipkin 和 Jaeger 等跟踪工具使您能够跟踪哪个客户端调用了哪个服务器进行哪个操作，以及每次调用花费了多长时间 [46]。

数据库提供了各种机制来确保数据一致性，正如我们将在第 6 章和第 8 章中看到的。然而，当每个服务都有自己的数据库时，维护这些不同服务之间的数据一致性就成为了应用程序的问题。分布式事务是确保一致性的一种可能技术，但在微服务环境中很少使用，因为它们与使服务彼此独立的目标相悖，并且许多数据库不支持它们 [47]。

基于以上所有原因，如果你可以在单台机器上完成某项工作，这通常比建立一个分布式系统要简单得多且成本更低 [23, 43, 48]。CPU、内存和磁盘的容量、速度和可靠性都在不断提升。当与单节点数据库如 DuckDB、SQLite 和 KùzuDB 结合时，许多工作负载现在可以在单个节点上运行。我们将在第 4 章中对此主题进行更深入的探讨。

### 微服务与无服务器

将系统分布在多台机器上的最常见方法是将其划分为客户端和服务器，让客户端向服务器发出请求。最常用的通信方式是 HTTP，正如我们将在[通过服务的数据流：REST 和 RPC](encoding-and-evolution.md#通过服务的数据流rest-和-rpc)中讨论的那样。相同的进程可以既是服务器（处理传入请求），又是客户端（向其他服务发出请求）。

这种构建应用程序的方式传统上被称为*面向服务的架构*（SOA）；最近，这一理念被细化为*微服务*架构。在这种架构中，服务有一个明确的目的（例如，在 S3 的情况下，这将是文件存储）；每个服务都暴露一个可以通过网络由客户端调用的 API，并且每个服务都有一个团队负责其维护。因此，一个复杂的应用程序可以被分解为多个相互作用的服务，每个服务由一个独立的团队管理。

将复杂的软件拆分为多个服务有几个优点：每个服务可以独立更新，从而减少团队之间的协调工作；每个服务可以分配所需的硬件资源；通过在 API 后隐藏实现细节，服务所有者可以自由更改实现而不影响客户端。在数据存储方面，通常每个服务都有自己的数据库，而不在服务之间共享数据库：共享数据库实际上会使整个数据库结构成为服务 API 的一部分，这样结构就很难更改。共享数据库还可能导致一个服务的查询对其他服务的性能产生负面影响。

另一方面，拥有许多服务本身可能会导致复杂性：每个服务都需要基础设施来部署新版本，调整分配的硬件资源以匹配负载，收集日志，监控服务健康状况，并在出现问题时提醒值班工程师。像 Kubernetes 这样的*编排*框架已成为部署服务的流行方式，因为它们为这种基础设施提供了基础。在开发过程中测试服务可能会很复杂，因为您还需要运行所有依赖的其他服务。

微服务 API 的演进可能会面临挑战。调用 API 的客户端期望 API 具有某些字段。随着业务需求的变化，开发人员可能希望向 API 添加或删除字段，但这样做可能会导致客户端失败。更糟糕的是，这种失败通常在开发周期的后期才被发现，当时更新的服务 API 已部署到暂存或生产环境中。API 描述标准如 OpenAPI 和 gRPC 有助于管理客户端和服务器 API 之间的关系；我们将在第 5 章中进一步讨论这些内容。

微服务主要是解决人际问题的技术方案：允许不同团队独立进展，而无需相互协调。这在大公司中是有价值的，但在小公司中，团队数量不多，使用微服务可能会带来不必要的开销，最好以尽可能简单的方式实现应用程序 [49]。

无服务器，或称为*函数即服务*（FaaS），是一种部署服务的另一种方法，在这种方法中，基础设施的管理外包给云供应商 [32]。使用虚拟机时，您必须明确选择何时启动或关闭实例；而在无服务器模型中，云提供商会根据对您服务的请求自动分配和释放硬件资源 [51]。无服务器部署将更多的运营负担转移给云提供商，并通过使用量而非机器实例实现灵活计费。为了提供这些好处，许多无服务器基础设施提供商对函数执行施加时间限制，限制运行时环境，并可能在首次调用函数时遭遇启动时间缓慢的问题。“无服务器”一词也可能具有误导性：每个无服务器函数的执行仍然在服务器上运行，但后续执行可能在不同的服务器上进行。此外，像 BigQuery 和各种 Kafka 产品这样的基础设施也采用了“无服务器”术语，以表明它们的服务能够自动扩展，并且按使用量而非机器实例计费。

就像云存储用计量计费模型取代了容量规划（提前决定购买多少硬盘），无服务器方法也将计量计费引入了代码执行：您只需为应用程序代码实际运行的时间付费，而不必提前配置资源。

### 云计算与超级计算

云计算并不是构建大规模计算系统的唯一方式；另一种选择是*高性能计算*（HPC），也称为超级计算。尽管存在重叠，但 HPC 通常有不同的优先级，并使用与云计算和企业数据中心系统不同的技术。这些差异包括：

- 超级计算机通常用于计算密集型科学计算任务，例如天气预报、气候建模、分子动力学（模拟原子和分子的运动）、复杂优化问题以及求解偏微分方程。另一方面，云计算往往用于在线服务、业务数据系统以及需要高可用性来满足用户请求的类似系统。

- 超级计算机通常运行大型批处理作业，这些作业会不时将其计算状态检查点保存到磁盘。如果某个节点发生故障，常见的解决方案是简单地停止整个集群的工作负载，修复故障节点，然后从最后一个检查点重新启动计算 [52, 53]。在云服务中，通常不希望停止整个集群，因为服务需要持续为用户提供服务，尽量减少中断。

- 超级计算机节点通常通过共享内存和远程直接内存访问（RDMA）进行通信，这支持高带宽和低延迟，但假设系统用户之间存在高度信任 [54]。在云计算中，网络和机器通常由相互不信任的组织共享，这需要更强的安全机制，例如资源隔离（例如，虚拟机）、加密和身份验证。

- 云数据中心网络通常基于 IP 和以太网，采用 Clos 拓扑结构，以提供高切分带宽——这是衡量网络整体性能的常用指标 [52, 55]。超级计算机通常使用专门的网络拓扑，如多维网格和环形拓扑 [56]，这些拓扑在具有已知通信模式的高性能计算工作负载中能提供更好的性能。

- 云计算允许节点分布在多个地理区域，而超级计算机通常假设它们的所有节点都靠得很近。

大规模分析系统有时与超级计算有一些共同特征，这就是为什么如果你在这个领域工作，了解这些技术是值得的。然而，本书主要关注需要持续可用的服务，如[可靠性和容错性](defining-nonfunctional-requirements.md#可靠性和容错性)中所讨论的。

## 数据系统、法律与社会

到目前为止，你在本章中看到数据系统的架构不仅受到技术目标和要求的影响，还受到支持它们的组织的人类需求的影响。越来越多的数据系统工程师意识到，仅仅满足自己业务的需求是不够的：我们还对整个社会负有责任。

一个特别关注的问题是存储有关人及其行为数据的系统。自 2018 年以来，*通用数据保护条例*（GDPR）赋予许多欧洲国家的居民对其个人数据更大的控制权和法律权利，类似的隐私法规也在世界各地的其他国家和州被采纳，例如加利福尼亚消费者隐私法案（CCPA）。关于人工智能的法规，如*欧盟人工智能法案*，对个人数据的使用施加了进一步的限制。

此外，即使在不直接受监管的领域，人们也越来越认识到计算机系统对个人和社会的影响。社交媒体改变了个人获取新闻的方式，这影响了他们的政治观点，从而可能影响选举结果。自动化系统越来越多地做出对个人产生深远影响的决策，例如决定谁应该获得贷款或保险覆盖，谁应该被邀请参加面试，或谁应该被怀疑犯罪 [57]。

每个从事此类系统工作的人都有责任考虑其伦理影响，并确保其遵守相关法律。并不需要每个人都成为法律和伦理方面的专家，但对法律和伦理原则的基本认识与例如在分布式系统方面的一些基础知识同样重要。

法律考虑正在影响数据系统设计的基础 [58]。例如，GDPR 赋予个人在请求时删除其数据的权利（有时称为被*遗忘权*）。然而，正如我们在本书中将看到的，许多数据系统依赖于不可变构造，例如仅追加日志，作为其设计的一部分；我们如何确保在一个应该是不可变的文件中删除某些数据？我们如何处理已经纳入派生数据集（见[记录系统和派生数据](#记录系统与派生数据)）的数据的删除，例如用于机器学习模型的训练数据？回答这些问题带来了新的工程挑战。

目前，我们没有明确的指导方针来判断哪些特定技术或系统架构应被视为“符合 GDPR”的。该法规故意不强制规定特定技术，因为这些技术可能会随着技术的发展而迅速变化。相反，法律文本列出了需要解释的高层次原则。这意味着对于如何遵守隐私法规的问题没有简单的答案，但我们将在本书中通过这个视角来审视一些技术。

一般来说，我们存储数据是因为我们认为其价值大于存储成本。然而，值得记住的是，存储成本不仅仅是你为 Amazon S3 或其他服务支付的账单：成本效益计算还应考虑到如果数据被泄露或被对手破坏所带来的责任和声誉损害的风险，以及如果数据的存储和处理被发现不符合法律规定所带来的法律费用和罚款的风险 [48]。

政府或警察可能会迫使公司交出数据。当数据可能揭示被刑事化的行为（例如，在一些中东和非洲国家的同性恋，或在一些美国州寻求堕胎）时，存储这些数据会给用户带来真实的安全风险。例如，前往堕胎诊所的行程可能会通过位置数据轻易被揭示，甚至可能通过用户的 IP 地址日志（指示大致位置）随时间的推移被发现。

一旦考虑到所有风险，决定某些数据根本不值得存储，并因此应被删除，可能是合理的。这一*数据最小化*原则（有时被称为德语术语 *Datensparsamkeit*）与“数据大”哲学相悖，该哲学主张投机性地存储大量数据，以防将来发现其有用[59]。但它与 GDPR 相符，GDPR 规定个人数据只能为特定的、明确的目的收集，且这些数据不得用于其他任何目的，并且数据不得保留超过收集目的所需的时间[60]。

企业也开始关注隐私和安全问题。信用卡公司要求支付处理企业遵守严格的支付卡行业（PCI）标准。处理商会接受独立审计员的频繁评估，以验证持续合规性。软件供应商也面临着更严格的审查。许多买家现在要求他们的供应商遵守服务组织控制（SOC）2 型标准。与 PCI 合规一样，供应商也会接受第三方审计以验证遵守情况。

一般来说，平衡企业的需求与收集和处理数据的人的需求是很重要的。这个话题还有很多内容；

## 总结

本章的主题是理解权衡：也就是说，认识到对于许多问题并没有一个正确的答案，而是有几种不同的方法，每种方法都有其优缺点。我们探讨了一些影响数据系统架构的最重要选择，并介绍了在本书其余部分中需要的术语。

我们首先区分了操作性（事务处理，OLTP）和分析性（OLAP）系统，并看到了它们的不同特征：不仅管理不同类型的数据和不同的访问模式，还服务于不同的受众。我们遇到了数据仓库和数据湖的概念，它们通过 ETL 从操作系统接收数据流。在[第 4 章](storage-and-retrieval.md)中，我们将看到操作性和分析性系统由于需要服务的查询类型不同，通常使用非常不同的内部数据布局。

我们接着比较了云服务，这是一种相对较新的发展，与之前主导数据系统架构的传统自托管软件范式。哪种方法更具成本效益在很大程度上取决于您的具体情况，但不可否认的是，云原生方法正在改变数据系统的架构方式，例如在存储和计算的分离方式上。

云系统本质上是分布式的，我们简要考察了分布式系统与使用单台机器相比的一些权衡。在某些情况下，您无法避免采用分布式，但如果可以将系统保持在单台机器上，建议不要急于将其分布式化。在[链接即将发布]和[链接即将发布]中，我们将更详细地讨论分布式系统面临的挑战。

最后，我们看到数据系统架构不仅由部署系统的业务需求决定，还受到保护处理数据的人的权利的隐私法规的影响——这是许多工程师容易忽视的一个方面。我们如何将法律要求转化为技术实现尚未得到很好的理解，但在我们继续阅读本书的其余部分时，牢记这个问题是很重要的。

## 参考文献

[1] Richard T. Kouzes, Gordon A. Anderson, Stephen T. Elbert, Ian Gorton, and Deborah K. Gracio. The Changing Paradigm of Data-Intensive Computing. IEEE Computer, volume 42, issue 1, January 2009. doi:10.1109/MC.2009.26

[2] Martin Kleppmann, Adam Wiggins, Peter van Hardenberg, and Mark McGranaghan. Local-first software: you own your data, in spite of the cloud. At 2019 ACM SIGPLAN International Symposium on New Ideas, New Paradigms, and Reflections on Programming and Software (Onward!), October 2019. doi:10.1145/3359591.3359737

[3] Joe Reis and Matt Housley. Fundamentals of Data Engineering. O’Reilly Media, 2022. ISBN: 9781098108304

[4] Rui Pedro Machado and Helder Russa. Analytics Engineering with SQL and dbt. O’Reilly Media, 2023. ISBN: 9781098142384

[5] Edgar F. Codd, S. B. Codd, and C. T. Salley. Providing OLAP to User-Analysts: An IT Mandate. E. F. Codd Associates, 1993. Archived at perma.cc/RKX8-2GEE

[6] Chinmay Soman and Neha Pawar. Comparing Three Real-Time OLAP Databases: Apache Pinot, Apache Druid, and ClickHouse. startree.ai, April 2023. Archived at perma.cc/8BZP-VWPA

[7] Surajit Chaudhuri and Umeshwar Dayal. An Overview of Data Warehousing and OLAP Technology. ACM SIGMOD Record, volume 26, issue 1, pages 65–74, March 1997. doi:10.1145/248603.248616

[8] Fatma Özcan, Yuanyuan Tian, and Pinar Tözün. Hybrid Transactional/Analytical Processing: A Survey. At ACM International Conference on Management of Data (SIGMOD), May 2017. doi:10.1145/3035918.3054784

[9] Adam Prout, Szu-Po Wang, Joseph Victor, Zhou Sun, Yongzhu Li, Jack Chen, Evan Bergeron, Eric Hanson, Robert Walzer, Rodrigo Gomes, and Nikita Shamgunov. Cloud-Native Transactions and Analytics in SingleStore. At International Conference on Management of Data (SIGMOD), June 2022. doi:10.1145/3514221.3526055

[10] Chao Zhang, Guoliang Li, Jintao Zhang, Xinning Zhang, and Jianhua Feng. HTAP Databases: A Survey. IEEE Transactions on Knowledge and Data Engineering, April 2024. doi:10.1109/TKDE.2024.3389693

[11] Michael Stonebraker and Uğur Çetintemel. ‘One Size Fits All’: An Idea Whose Time Has Come and Gone. At 21st International Conference on Data Engineering (ICDE), April 2005. doi:10.1109/ICDE.2005.1

[12] Jeffrey Cohen, Brian Dolan, Mark Dunlap, Joseph M. Hellerstein, and Caleb Welton. MAD Skills: New Analysis Practices for Big Data. Proceedings of the VLDB Endowment, volume 2, issue 2, pages 1481–1492, August 2009. doi:10.14778/1687553.1687576

[13] Dan Olteanu. The Relational Data Borg is Learning. Proceedings of the VLDB Endowment, volume 13, issue 12, August 2020. doi:10.14778/3415478.3415572

[14] Matt Bornstein, Martin Casado, and Jennifer Li. Emerging Architectures for Modern Data Infrastructure: 2020. future.a16z.com, October 2020. Archived at perma.cc/LF8W-KDCC

[15] Martin Fowler. DataLake. martinfowler.com, February 2015. Archived at perma.cc/4WKN-CZUK

[16] Bobby Johnson and Joseph Adler. The Sushi Principle: Raw Data Is Better. At Strata+Hadoop World, February 2015.

[17] Michael Armbrust, Ali Ghodsi, Reynold Xin, and Matei Zaharia. Lakehouse: A New Generation of Open Platforms that Unify Data Warehousing and Advanced Analytics. At 11th Annual Conference on Innovative Data Systems Research (CIDR), January 2021.

[18] DataKitchen, Inc. The DataOps Manifesto. dataopsmanifesto.org, 2017. Archived at perma.cc/3F5N-FUQ4

[19] Tejas Manohar. What is Reverse ETL: A Definition & Why It’s Taking Off. hightouch.io, November 2021. Archived at perma.cc/A7TN-GLYJ

[20] Simon O’Regan. Designing Data Products. towardsdatascience.com, August 2018. Archived at perma.cc/HU67-3RV8

[21] Camille Fournier. Why is it so hard to decide to buy? skamille.medium.com, July 2021. Archived at perma.cc/6VSG-HQ5X

[22] David Heinemeier Hansson. Why we’re leaving the cloud. world.hey.com, October 2022. Archived at perma.cc/82E6-UJ65

[23] Nima Badizadegan. Use One Big Server. specbranch.com, August 2022. Archived at perma.cc/M8NB-95UK

[24] Steve Yegge. Dear Google Cloud: Your Deprecation Policy is Killing You. steve-yegge.medium.com, August 2020. Archived at perma.cc/KQP9-SPGU

[25] Alexandre Verbitski, Anurag Gupta, Debanjan Saha, Murali Brahmadesam, Kamal Gupta, Raman Mittal, Sailesh Krishnamurthy, Sandor Maurice, Tengiz Kharatishvili, and Xiaofeng Bao. Amazon Aurora: Design Considerations for High Throughput Cloud-Native Relational Databases. At ACM International Conference on Management of Data (SIGMOD), pages 1041–1052, May 2017. doi:10.1145/3035918.3056101

[26] Panagiotis Antonopoulos, Alex Budovski, Cristian Diaconu, Alejandro Hernandez Saenz, Jack Hu, Hanuma Kodavalla, Donald Kossmann, Sandeep Lingam, Umar Farooq Minhas, Naveen Prakash, Vijendra Purohit, Hugh Qu, Chaitanya Sreenivas Ravella, Krystyna Reisteter, Sheetal Shrotri, Dixin Tang, and Vikram Wakade. Socrates: The New SQL Server in the Cloud. At ACM International Conference on Management of Data (SIGMOD), pages 1743–1756, June 2019. doi:10.1145/3299869.3314047

[27] Midhul Vuppalapati, Justin Miron, Rachit Agarwal, Dan Truong, Ashish Motivala, and Thierry Cruanes. Building An Elastic Query Engine on Disaggregated Storage. At 17th USENIX Symposium on Networked Systems Design and Implementation (NSDI), February 2020.

[28] Colin Breck. Predicting the Future of Distributed Systems. blog.colinbreck.com, August 2024. Archived at perma.cc/K5FC-4XX2

[29] Gwen Shapira. Compute-Storage Separation Explained. thenile.dev, January 2023. Archived at perma.cc/QCV3-XJNZ

[30] Ravi Murthy and Gurmeet Goindi. AlloyDB for PostgreSQL under the hood: Intelligent, database-aware storage. cloud.google.com, May 2022. Archived at archive.org

[31] Jack Vanlightly. The Architecture of Serverless Data Systems. jack-vanlightly.com, November 2023. Archived at perma.cc/UDV4-TNJ5

[32] Eric Jonas, Johann Schleier-Smith, Vikram Sreekanti, Chia-Che Tsai, Anurag Khandelwal, Qifan Pu, Vaishaal Shankar, Joao Carreira, Karl Krauth, Neeraja Yadwadkar, Joseph E. Gonzalez, Raluca Ada Popa, Ion Stoica, David A. Patterson. Cloud Programming Simplified: A Berkeley View on Serverless Computing. arxiv.org, February 2019.

[33] Betsy Beyer, Jennifer Petoff, Chris Jones, and Niall Richard Murphy. Site Reliability Engineering: How Google Runs Production Systems. O’Reilly Media, 2016. ISBN: 9781491929124

[34] Thomas Limoncelli. The Time I Stole $10,000 from Bell Labs. ACM Queue, volume 18, issue 5, November 2020. doi:10.1145/3434571.3434773

[35] Charity Majors. The Future of Ops Jobs. acloudguru.com, August 2020. Archived at perma.cc/GRU2-CZG3

[36] Boris Cherkasky. (Over)Pay As You Go for Your Datastore. medium.com, September 2021. Archived at perma.cc/Q8TV-2AM2

[37] Shlomi Kushchi. Serverless Doesn’t Mean DevOpsLess or NoOps. thenewstack.io, February 2023. Archived at perma.cc/3NJR-AYYU

[38] Erik Bernhardsson. Storm in the stratosphere: how the cloud will be reshuffled. erikbern.com, November 2021. Archived at perma.cc/SYB2-99P3

[39] Benn Stancil. The data OS. benn.substack.com, September 2021. Archived at perma.cc/WQ43-FHS6

[40] Maria Korolov. Data residency laws pushing companies toward residency as a service. csoonline.com, January 2022. Archived at perma.cc/CHE4-XZZ2

[41] Kousik Nath. These are the numbers every computer engineer should know. freecodecamp.org, September 2019. Archived at perma.cc/RW73-36RL

[42] Joseph M. Hellerstein, Jose Faleiro, Joseph E. Gonzalez, Johann Schleier-Smith, Vikram Sreekanti, Alexey Tumanov, and Chenggang Wu. Serverless Computing: One Step Forward, Two Steps Back. At Conference on Innovative Data Systems Research (CIDR), January 2019.

[43] Frank McSherry, Michael Isard, and Derek G. Murray. Scalability! But at What COST? At 15th USENIX Workshop on Hot Topics in Operating Systems (HotOS), May 2015.

[44] Cindy Sridharan. Distributed Systems Observability: A Guide to Building Robust Systems. Report, O’Reilly Media, May 2018. Archived at perma.cc/M6JL-XKCM

[45] Charity Majors. Observability — A 3-Year Retrospective. thenewstack.io, August 2019. Archived at perma.cc/CG62-TJWL

[46] Benjamin H. Sigelman, Luiz André Barroso, Mike Burrows, Pat Stephenson, Manoj Plakal, Donald Beaver, Saul Jaspan, and Chandan Shanbhag. Dapper, a Large-Scale Distributed Systems Tracing Infrastructure. Google Technical Report dapper-2010-1, April 2010. Archived at perma.cc/K7KU-2TMH

[47] Rodrigo Laigner, Yongluan Zhou, Marcos Antonio Vaz Salles, Yijian Liu, and Marcos Kalinowski. Data management in microservices: State of the practice, challenges, and research directions. Proceedings of the VLDB Endowment, volume 14, issue 13, pages 3348–3361, September 2021. doi:10.14778/3484224.3484232

[48] Jordan Tigani. Big Data is Dead. motherduck.com, February 2023. Archived at perma.cc/HT4Q-K77U

[49] Sam Newman. Building Microservices, second edition. O’Reilly Media, 2021. ISBN: 9781492034025

[50] Chris Richardson. Microservices: Decomposing Applications for Deployability and Scalability. infoq.com, May 2014. Archived at perma.cc/CKN4-YEQ2

[51] Mohammad Shahrad, Rodrigo Fonseca, Íñigo Goiri, Gohar Chaudhry, Paul Batum, Jason Cooke, Eduardo Laureano, Colby Tresness, Mark Russinovich, Ricardo Bianchini. Serverless in the Wild: Characterizing and Optimizing the Serverless Workload at a Large Cloud Provider. At USENIX Annual Technical Conference (ATC), July 2020.

[52] Luiz André Barroso, Urs Hölzle, and Parthasarathy Ranganathan. The Datacenter as a Computer: Designing Warehouse-Scale Machines, third edition. Morgan & Claypool Synthesis Lectures on Computer Architecture, October 2018. doi:10.2200/S00874ED3V01Y201809CAC046

[53] David Fiala, Frank Mueller, Christian Engelmann, Rolf Riesen, Kurt Ferreira, and Ron Brightwell. Detection and Correction of Silent Data Corruption for Large-Scale High-Performance Computing,” at International Conference for High Performance Computing, Networking, Storage and Analysis (SC), November 2012. doi:10.1109/SC.2012.49

[54] Anna Kornfeld Simpson, Adriana Szekeres, Jacob Nelson, and Irene Zhang. Securing RDMA for High-Performance Datacenter Storage Systems. At 12th USENIX Workshop on Hot Topics in Cloud Computing (HotCloud), July 2020.

[55] Arjun Singh, Joon Ong, Amit Agarwal, Glen Anderson, Ashby Armistead, Roy Bannon, Seb Boving, Gaurav Desai, Bob Felderman, Paulie Germano, Anand Kanagala, Jeff Provost, Jason Simmons, Eiichi Tanda, Jim Wanderer, Urs Hölzle, Stephen Stuart, and Amin Vahdat. Jupiter Rising: A Decade of Clos Topologies and Centralized Control in Google’s Datacenter Network. At Annual Conference of the ACM Special Interest Group on Data Communication (SIGCOMM), August 2015. doi:10.1145/2785956.2787508

[56] Glenn K. Lockwood. Hadoop’s Uncomfortable Fit in HPC. glennklockwood.blogspot.co.uk, May 2014. Archived at perma.cc/S8XX-Y67B

[57] Cathy O’Neil: Weapons of Math Destruction: How Big Data Increases Inequality and Threatens Democracy. Crown Publishing, 2016. ISBN: 9780553418811

[58] Supreeth Shastri, Vinay Banakar, Melissa Wasserman, Arun Kumar, and Vijay Chidambaram. Understanding and Benchmarking the Impact of GDPR on Database Systems. Proceedings of the VLDB Endowment, volume 13, issue 7, pages 1064–1077, March 2020. doi:10.14778/3384345.3384354

[59] Martin Fowler. Datensparsamkeit. martinfowler.com, December 2013. Archived at perma.cc/R9QX-CME6

[60] Regulation (EU) 2016/679 of the European Parliament and of the Council of 27 April 2016 (General Data Protection Regulation). Official Journal of the European Union L 119/1, May 2016.
