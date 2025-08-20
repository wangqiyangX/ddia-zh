# 编码与演进

> 一切都在变化，没有什么是静止的。
>
> _以弗所的赫拉克利特，柏拉图在《克拉底鲁篇》中引用 (公元前 360 年)_

应用程序不可避免地会随着时间而变化。随着新产品的推出、用户需求的更好理解或商业环境的变化，功能会被添加或修改。在[第二章](defining-nonfunctional-requirements.md)中，我们介绍了可演进性的概念：我们应该旨在构建易于适应变化的系统 (见 [“可演化性：使改变更简单”](defining-nonfunctional-requirements.md#可演化性使改变更简单))。

在大多数情况下，对应用程序功能的更改也需要对其存储的数据进行更改：可能需要捕获一个新的字段或记录类型，或者可能需要以新的方式呈现现有数据。

我们在第三章讨论的数据模型以不同的方式应对这种变化。关系数据库通常假设数据库中的所有数据都符合一个模式：尽管该模式可以通过模式迁移 (即 ALTER 语句) 进行更改，但在任何时刻都只有一个模式有效。相比之下，按需模式 (“无模式”) 数据库不强制执行模式，因此数据库可以包含在不同时间写入的旧数据和新数据格式的混合 (参见 [“文档模型中的模式灵活性”](data-models-and-query-languages.md#文档模型中的模式灵活性))。

当数据格式或模式发生变化时，应用程序代码通常也需要相应地进行更改 (例如，您向记录中添加一个新字段，应用程序代码开始读取和写入该字段)。然而，在大型应用程序中，代码更改往往无法瞬间完成：

- 对于服务器端应用程序，您可能希望进行滚动升级 (也称为分阶段发布)，将新版本逐步部署到几个节点，检查新版本是否运行顺利，然后逐渐覆盖所有节点。这允许在没有服务停机的情况下部署新版本，从而鼓励更频繁的发布和更好的演进能力。

- 对于客户端应用程序，您则要依赖用户，用户可能会在一段时间内不安装更新。

这意味着旧版本和新版本的代码，以及旧数据格式和新数据格式，可能会在系统中同时共存。为了确保系统能够继续顺利运行，我们需要在两个方向上保持兼容性：

**向后兼容性**

较新的代码可以读取由较旧的代码写入的数据。

**向前兼容性**

较旧的代码可以读取由较新的代码写入的数据。

向后兼容性通常不难实现：作为较新代码的作者，您知道较旧代码写入的数据格式，因此您可以明确处理它 (如果有必要，可以简单地保留旧代码以读取旧数据)。向前兼容性可能更棘手，因为它要求旧代码忽略较新版本代码所做的添加。

向前兼容性的另一个挑战在图 5-1 中得到了说明。假设你在记录模式中添加了一个字段，新的代码创建了一个包含该新字段的记录并将其存储在数据库中。随后，旧版本的代码 (尚不知道新字段) 读取该记录，更新它并写回。在这种情况下，通常期望的行为是旧代码能够保持新字段的完整性，即使它无法被解释。但是，如果记录被解码为一个不明确保留未知字段的模型对象，数据可能会丢失，如图 5-1 所示。

![ddia 0501](/ddia/ddia_0501.png)
_图 5-1。当应用程序的旧版本更新由应用程序的新版本之前写入的数据时，如果不小心，数据可能会丢失。_

在本章中，我们将探讨几种数据编码格式，包括 JSON、XML、Protocol Buffers 和 Avro。特别是关注它们如何处理模式变化，以及它们如何支持旧数据和新数据及代码共存的系统。然后，我们将讨论这些格式如何用于数据存储和通信：在数据库、Web 服务、REST API、远程过程调用 (RPC)、工作流引擎以及事件驱动系统，如执行者和消息队列中。

## 数据编码格式

程序通常以 (至少) 两种不同的表示形式处理数据：

1. 在内存中，数据以对象、结构、列表、数组、哈希表、树等形式存储。这些数据结构经过优化，以便 CPU (通常使用指针) 能够高效地访问和操作。

2. 当你想将数据写入文件或通过网络发送时，必须将其编码为某种自包含的字节序列 (例如，JSON 文档)。由于指针对其他进程没有意义，因此这种字节序列表示通常与内存中通常使用的数据结构看起来相差甚远。

因此，我们需要在这两种表示之间进行某种转换。从内存表示到字节序列的转换称为编码 (也称为序列化或编组)，而反向过程称为解码 (解析、反序列化、解编组)。

::: tip 术语冲突
不幸的是，序列化在事务的上下文中也被使用 (见第 8 章)，其含义完全不同。为了避免对这个词的过度使用，我们在本书中将坚持使用编码，尽管序列化可能是一个更常见的术语。
:::

在某些情况下，不需要进行编码 / 解码 —— 例如，当数据库直接对从磁盘加载的压缩数据进行操作时，如 [“查询执行：编译和向量化”](./storage-and-retrieval.md#查询执行编译和向量化) 中所讨论的那样。还有一些零拷贝数据格式，主要在运行时和磁盘 / 网络上使用，而无需显式的转换步骤，例如 Cap’n Proto 和 FlatBuffers。

然而，大多数系统需要在内存对象和扁平字节序列之间进行转换。由于这是一个非常常见的问题，因此有无数不同的库和编码格式可供选择。让我们做一个简要概述。

### 特定语言格式

许多编程语言内置支持将内存对象编码为字节序列。例如，Java 有 `java.io.Serializable` ，Python 有 `pickle` ，Ruby 有 `Marshal` ，等等。还有许多第三方库，例如 Java 的 Kryo。

> 阅读笔记
>
> Swift 中有 `Codable`

这些编码库非常方便，因为它们允许以最少的额外代码保存和恢复内存中的对象。然而，它们也存在许多深层次的问题：

- 编码通常与特定的编程语言相关联，在另一种语言中读取数据非常困难。如果您以这种编码存储或传输数据，您就将自己锁定在当前的编程语言中，可能会持续很长时间，并且排除了与其他组织 (可能使用不同语言) 系统的集成。

- 为了在相同的对象类型中恢复数据，解码过程需要能够实例化任意类。这通常是安全问题的来源 \[1]：如果攻击者能够让您的应用程序解码任意字节序列，他们就可以实例化任意类，这反过来往往允许他们做一些可怕的事情，例如远程执行任意代码 \[2, 3]。

- 在这些库中，数据版本控制通常是事后考虑的：由于它们旨在快速和轻松地编码数据，因此往往忽视了向前和向后兼容性的问题 \[4]。

- 效率 (编码或解码所需的 CPU 时间，以及编码结构的大小) 通常也是一个事后考虑的问题。例如，Java 的内置序列化因其糟糕的性能和臃肿的编码而臭名昭著 \[5]。

出于这些原因，通常不建议将您所使用语言的内置编码用于除非常短暂的目的之外的任何其他用途。

### JSON、XML 和二进制变体

在转向可以被多种编程语言读取和写入的标准化编码时，JSON 和 XML 是显而易见的竞争者。它们广为人知，得到广泛支持，但几乎同样受到广泛的厌恶。XML 常常因过于冗长和不必要的复杂性而受到批评 \[6]。JSON 的流行主要归功于其在网页浏览器中的内置支持以及相对于 XML 的简单性。CSV 是另一种流行的语言无关格式，但它仅支持不带嵌套的表格数据。

JSON、XML 和 CSV 是文本格式，因此在某种程度上是人类可读的 (尽管语法是一个热门的争论话题)。除了表面的语法问题，它们还有一些微妙的问题：

- 关于数字的编码存在很多模糊性。在 XML 和 CSV 中，您无法区分一个数字和恰好由数字组成的字符串 (除非参考外部模式)。JSON 区分字符串和数字，但它不区分整数和浮点数，也没有指定精度。

- 在处理大数字时这是一个问题；例如，大于 $2^undefined$ 的整数无法在 IEEE 754 双精度浮点数中准确表示，因此在使用浮点数的语言 (如 JavaScript \[7]) 中解析时，这些数字会变得不准确。大于 $2^undefined$ 的数字的一个例子出现在 X (前身为 Twitter) 上，它使用 64 位数字来标识每个帖子。API 返回的 JSON 包含两次帖子 ID，一次作为 JSON 数字，一次作为十进制字符串，以解决这些数字在 JavaScript 应用程序中未被正确解析的问题 \[8]。

- JSON 和 XML 对 Unicode 字符串 (即人类可读文本) 有很好的支持，但它们不支持二进制字符串 (没有字符编码的字节序列)。二进制字符串是一个有用的特性，因此人们通过使用 Base64 将二进制数据编码为文本来绕过这个限制。然后使用模式来指示该值应被解释为 Base64 编码。此方式虽然可行，但稍显极客，并且使得数据大小额外增加了大约 33%。

- XML Schema 和 JSON Schema 功能强大，因此学习和实现起来相当复杂。由于数据 (如数字和二进制字符串) 的正确解释依赖于模式中的信息，因此不使用 XML/JSON 模式的应用程序可能需要硬编码适当的编码 / 解码逻辑。

- CSV 没有任何模式，因此由应用程序来定义每一行和每一列的含义。如果应用程序的更改添加了新的行或列，您必须手动处理该更改。CSV 也是一种相当模糊的格式 (如果一个值包含逗号或换行符会发生什么？)。尽管其转义规则已被正式规定 \[9]，但并非所有解析器都能正确实现这些规则。

尽管存在这些缺陷，JSON、XML 和 CSV 在许多场合下仍然足够好。它们可能会继续流行，特别是在数据交换格式方面 (即用于将数据从一个组织发送到另一个组织)。在这些情况下，只要人们对格式达成一致，格式的美观或效率往往并不重要。让不同组织在任何事情上达成一致的难度超过了大多数其他问题。

#### JSON Schema

JSON Schema 已被广泛采用，作为在系统之间交换数据或写入存储时建模数据的一种方式。您会在 web 服务中找到 JSON Schema (参见 “Web 服务”)，作为 OpenAPI web 服务规范的一部分，在 Confluent 的 Schema Registry 和 Red Hat 的 Apicurio Registry 等模式注册中心，以及在 PostgreSQL 的 `pg_jsonschema` 验证器扩展和 MongoDB 的 `$jsonSchema` 验证器语法等数据库中。

JSON Schema 规范提供了许多功能。模式包括标准的基本类型，包括字符串、数字、整数、对象、数组、布尔值或 null。但 JSON Schema 还提供了一个单独的验证规范，允许开发人员在字段上叠加约束。例如， `port` 字段可能有最小值 1 和最大值 65535。

JSON Schema 可以具有开放或封闭的内容模型。开放内容模型允许在模式中未定义的任何字段存在，并且可以使用任何数据类型，而封闭内容模型仅允许明确定义的字段。当 `additionalProperties` 设置为 `true` 时，JSON Schema 中的开放内容模型被启用，这也是默认设置。因此，JSON Schema 通常是对不被允许的内容的定义 (即在任何定义字段上无效的值)，而不是对模式中被允许内容的定义。

开放内容模型功能强大，但可能会很复杂。例如，假设您想定义一个从整数 (例如 ID) 到字符串的映射。JSON 没有映射或字典类型，只有一种可以包含字符串键和任何类型值的 “对象” 类型。然后，您可以使用 JSON Schema 对此类型进行约束，以便键只能包含数字，值只能是字符串，使用 `patternProperties` 和 `additionalProperties` ，如示例 5-1 所示。

_示例 5-1. 示例 JSON Schema，具有整数键和字符串值。整数键表示为仅包含整数的字符串，因为 JSON Schema 要求所有键必须是字符串。_

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "patternProperties": {
    "^[0-9]+$": {
      "type": "string"
    }
  },
  "additionalProperties": false
}
```

除了开放和封闭的内容模型及验证器，JSON Schema 还支持条件的 if/else 模式逻辑、命名类型、对远程 schema 的引用等更多功能。这些都使得 JSON Schema 成为一种非常强大的 schema 语言。然而，这些特性也导致了定义的复杂性。解决远程 schema、推理条件规则或以向前或向后兼容的方式演进 schema 可能会面临挑战 \[10]。类似的问题也适用于 XML Schema \[11]。

#### 二进制编码

JSON 的冗长程度低于 XML，但与二进制格式相比，两者仍然占用较多空间。这一观察促使了多种 JSON 的二进制编码格式的发展 (例如 MessagePack、CBOR、BSON、BJSON、UBJSON、BISON、Hessian 和 Smile 等) 以及 XML 的二进制编码格式 (例如 WBXML 和 Fast Infoset)。这些格式在各个细分领域得到了应用，因为它们更紧凑，有时解析速度更快，但没有一种能像 JSON 和 XML 的文本版本那样被广泛采用 \[12]。

这些格式中的一些扩展了数据类型的集合 (例如，区分整数和浮点数，或添加对二进制字符串的支持)，但在其他方面保持了 JSON/XML 数据模型不变。特别是，由于它们不规定模式，因此需要在编码的数据中包含所有对象字段名称。也就是说，在示例 5-2 中 JSON 文档的二进制编码中，它们需要在某处包含字符串 `userName` 、 `favoriteNumber` 和 `interests`。

##### 示例 5-2 我们将在本章中以几种二进制格式编码的示例记录

```json
{
  "userName": "Martin",
  "favoriteNumber": 1337,
  "interests": ["daydreaming", "hacking"]
}
```

让我们看一个 MessagePack 的例子，这是 JSON 的一种二进制编码。图 5-2 显示了如果使用 MessagePack 编码示例 5-2 中的 JSON 文档所得到的字节序列。

![ddia 0502](/ddia/ddia_0502.png)
_图 5-2 使用 MessagePack 编码的示例记录 (示例 5-2)_

前几个字节如下：

1. 第一个字节 `0x83` 表示后面跟着的是一个对象 (高四位为 `0x80`)，它有三个字段 (低四位为 `0x03`)。(如果你想知道如果一个对象有超过 15 个字段会发生什么，那么字段的数量无法放入四位中，它将获得一个不同的类型指示符，字段的数量将编码为两个或四个字节)。

2. 第二个字节 `0xa8`，表示接下来的是一个字符串 (高四位为 `0xa0`)，长度为八个字节 (低四位为 `0x08`)。

3. 接下来的八个字节是字段名称 `userName` 的 ASCII 码。由于长度已在之前指明，因此不需要任何标记来告诉我们字符串何时结束 (或任何转义)。

4. 接下来的七个字节编码了六个字母的字符串值 `Martin` ，前缀为 `0xa6`，依此类推。

二进制编码的长度为 66 字节，这比文本 JSON 编码 (去除空白后) 所占的 81 字节少了一点。所有 JSON 的二进制编码在这方面都是相似的。目前尚不清楚如此小的空间减少 (以及可能的解析速度提升) 是否值得牺牲人类可读性。

在接下来的章节中，我们将看到如何做得更好，只用 32 字节就能编码相同的记录。

### Protocol Buffers

Protocol Buffers (protobuf) 是谷歌开发的二进制编码库。它类似于 Apache Thrift，后者最初由 Facebook 开发 \[13]；本节关于 Protocol Buffers 的内容大部分也适用于 Thrift。

Protocol Buffers 需要为任何编码的数据提供一个 schema。要 Protocol Buffers 中编码示例 5-2 中的数据，您需要使用 Protocol Buffers 接口定义语言 (IDL) 描述 schema，如下所示：

```txt
syntax = "proto3";

message Person {
    string user_name = 1;
    int64 favorite_number = 2;
    repeated string interests = 3;
}
```

Protocol Buffers 附带一个代码生成工具，该工具接受像这里所示的 schema 定义，并生成在各种编程语言中实现该 schema 的类。您的应用程序代码可以调用这些生成的代码来编码或解码该 schema 的记录。与 JSON Schema 相比，schema 语言非常简单：它仅定义记录的字段及其类型，但不支持对字段可能值的其他限制。

使用 Protocol Buffers 编码器编码示例 5-2 需要 33 个字节，如图 5-3 所示 \[14]。

![ddia 0503](/ddia/ddia_0503.png)
_图 5-3. 使用 Protocol Buffers 编码的示例记录。_

与图 5-2 类似，每个字段都有一个类型注释 (以指示它是字符串、整数等)，并在需要时提供长度指示 (例如字符串的长度)。数据中出现的字符串 (“Martin”、“daydreaming”、“hacking”) 也被编码为 ASCII (准确来说是 UTF-8)，与之前类似。

与图 5-2 相比，最大的不同是没有字段名称 ( `userName` 、 `favoriteNumber` 、 `interests` )。相反，编码的数据包含字段标签，这些标签是数字 (1、2 和 3)。这些数字出现在 schema 定义中。字段标签就像字段的别名 —— 它们是一种简洁的表达方式，无需拼出字段名称，就能说明我们谈论的是哪个字段。

正如你所看到的，Protocol Buffers 通过将字段类型和标签编号打包到一个字节中，节省了更多空间。它使用可变长度的整数：数字 1337 被编码为两个字节，每个字节的最高位用于指示是否还有更多字节。这意味着介于 - 64 和 63 之间的数字编码为一个字节，介于 - 8192 和 8191 之间的数字编码为两个字节，等等。更大的数字使用更多字节。

Protocol Buffers 并没有一个明确的列表或数组数据类型。相反， `repeated` 修饰符在 `interests` 字段上表示该字段包含一个值的列表，而不是单个值。在二进制编码中，列表元素仅通过在同一记录中重复出现相同的字段标签来表示。

#### 字段标签和模式演进

我们之前提到过，schema 不可避免地需要随着时间而变化。我们称之为模式演进。Protocol Buffers 如何处理模式演进，同时保持向后和向前兼容？

正如您从示例中看到的，编码记录只是其编码字段的串联。每个字段通过其标签编号 (示例模式中的数字 1 、 2 、 3) 进行标识，并带有数据类型的注释 (例如，字符串或整数)。如果字段值未设置，它将简单地从编码记录中省略。从这一点可以看出，字段标签对编码数据的含义至关重要。您可以更改 schema 中字段的名称，因为编码数据从不引用字段名称，但您不能更改字段的标签，因为那样会使所有现有的编码数据无效。

您可以向 schema 中添加新字段，只要为每个字段分配一个新的标签编号。如果旧代码 (不知道您添加的新标签编号) 尝试读取由新代码写入的数据，包括一个它不识别的新字段标签编号，它可以简单地忽略该字段。数据类型注释允许解析器确定需要跳过多少字节，并保留未知字段，以避免图 5-1 中的问题。<mark>这保持了向前兼容性：旧代码可以读取由新代码写入的记录</mark>。

那么向后兼容性呢？只要每个字段都有一个唯一的标签编号，新代码始终可以读取旧数据，因为标签编号仍然具有相同的含义。如果在新模式中添加了一个字段，而您读取的旧数据尚未包含该字段，则该字段将填充为默认值 (例如，如果字段类型为字符串，则为空字符串；如果是数字，则为零)。

删除字段就像添加字段一样，只是向后和向前兼容性的问题相反。你不能再次使用相同的标签编号，因为你可能仍然在某处有数据包含旧的标签编号，而新代码必须忽略该字段。过去使用的标签编号可以在模式定义中保留，以确保它们不会被遗忘。

那么，改变字段的数据类型呢？对于某些类型，这是可能的 —— 请查看文档以获取详细信息 —— 但存在值被截断的风险。例如，假设你将一个 32 位整数更改为 64 位整数。新代码可以轻松读取旧代码写入的数据，因为解析器可以用零填充任何缺失的位。然而，如果旧代码读取新代码写入的数据，旧代码仍然使用 32 位变量来保存该值。如果解码后的 64 位值无法适应 32 位，它将被截断。

### Avro

Apache Avro 是一种与 Protocol Buffers 截然不同的二进制编码格式。它于 2009 年作为 Hadoop 的子项目启动，原因是 Protocol Buffers 并不适合 Hadoop 的使用场景
\[15]。

Avro 还使用 schema 来指定被编码数据的结构。它有两种模式语言：一种 (Avro IDL) 旨在供人类编辑，另一种 (基于 JSON) 则更易于机器读取。与 Protocol Buffers 类似，这种 schema 语言仅指定字段及其类型，而不包含像 JSON Schema 中那样复杂的验证规则。

我们的示例 schema，使用 Avro IDL 编写，可能如下所示：

```txt
record Person {
    string userName;
    union { null, long } favoriteNumber = null;
    array<string> interests;
}
```

该模式的等效 JSON 表示如下：

```json
{
  "type": "record",
  "name": "Person",
  "fields": [
    { "name": "userName", "type": "string" },
    { "name": "favoriteNumber", "type": ["null", "long"], "default": null },
    { "name": "interests", "type": { "type": "array", "items": "string" } }
  ]
}
```

首先，请注意 schema 中没有标签编号。如果我们使用这个 schema 对我们的示例记录 ([示例 5-2](#示例-5-2-我们将在本章中以几种二进制格式编码的示例记录)) 进行编码，Avro 二进制编码仅为 32 字节长 —— 这是我们见过的所有编码中最紧凑的。编码字节序列的详细信息如图 5-4 所示。

如果你检查字节序列，你会发现没有任何东西可以识别字段或它们的数据类型。编码仅仅是将值连接在一起。一个字符串只是一个长度前缀，后面跟着 UTF-8 字节，但在编码数据中没有任何东西告诉你它是一个字符串。它也可能是一个整数，或者完全是其他东西。整数是使用可变长度编码进行编码的。

![ddia 0504](/ddia/ddia_0504.png)
_图 5-4 使用 Avro 编码的示例记录_

要解析二进制数据，你需要按照它们在 schema 中出现的顺序遍历字段，并使用模式来告诉你每个字段的数据类型。这意味着只有在读取数据的代码使用与写入数据的代码完全相同的 schema 时，二进制数据才能被正确解码。读者和写者之间的任何模式不匹配都将导致数据解码不正确。

那么，Avro 如何支持模式演进？

#### 写者 schema 和读者 schema

当一个应用程序想要编码一些数据 (将其写入文件或数据库，或通过网络发送等) 时，它使用它所知道的任何版本的 schema 来编码数据 —— 例如，该 schema 可能已编译到应用程序中。这被称为写者的 schema。

当一个应用程序想要解码一些数据 (从文件或数据库中读取，或从网络接收等) 时，它使用两种模式：与编码时使用的模式相同的写者 schema，以及可能不同的读者 schema。这在图 5-5 中进行了说明。读者 schema 定义了应用程序代码所期望的每个记录的字段及其类型。

![ddia 0505](/ddia/ddia_0505.png)
_图 5-5 在 Protocol Buffers 中，编码和解码可以使用不同版本的 schema。在 Avro 中，解码使用两种 schema：写者 schema 必须与编码时使用的 schema 相同，但读者 schema 可以是较旧或较新的版本_

如果读者的模式和写者的 schema 相同，解码就很简单。如果它们不同，Avro 通过并排查看写者的模式和读者的 schema 来解决差异，并将数据从写者的 schema 转换为读者的 schema。Avro 规范 \[16, 17] 准确地定义了这种解析是如何工作的，并在图 5-6 中进行了说明。

例如，如果写者的 schema 和读者的 schema 的字段顺序不同也没问题，因为 schema 解析是通过字段名称来匹配字段的。如果读取数据的代码遇到一个在写者的 schema 中出现但在读者的 schema 中没有的字段，则该字段会被忽略。如果读取数据的代码期望某个字段，但写者的 schema 中没有该名称的字段，则会用读者的 schema 中声明的默认值填充。

![ddia 0506](/ddia/ddia_0506.png)
_图 5-6. Avro 读取器解决写者的 schema 和读者的 schema 之间的差异。_

#### schema 演进规则

使用 Avro，向前兼容性意味着您可以将新版本的 schema 作为写者，而将旧版本的 schema 作为读者。相反，向后兼容性意味着您可以将新版本的 schema 作为读者，而将旧版本的 schema 作为写者。

> 阅读笔记
>
> 新增字段不会在被旧代码读取 (旧 schema 作为读者)，同时新代码读取旧数据时，新字段自动填充默认值 (新 schema 作为读者)。

为了保持兼容性，您只能添加或删除具有默认值的字段。(上述 Avro schema 中的字段 `favoriteNumber` 具有默认值 `null` 。) 例如，假设您添加了一个具有默认值的字段，因此这个新字段在新 schema 中存在，但在旧 schema 中不存在。当使用新 schema 的读者读取使用旧模式写入的记录时，缺失字段的默认值将被填充。

如果您添加一个没有默认值的字段，新读者将无法读取由旧写者写入的数据，因此您将破坏向后兼容性。如果您删除一个没有默认值的字段，旧读者将无法读取由新写者写入的数据，因此您将破坏向前兼容性。

在某些编程语言中， `null` 是任何变量的可接受默认值，但在 Avro 中并非如此：如果您想允许一个字段为 `null`，您必须使用联合类型。例如， `union { null, long, string } field;` 表示 `field` 可以是一个数字、一个字符串或 `null`。您只能在联合的第一个分支中使用 `null` 作为默认值。这比默认情况下所有内容都可为 `null` 要冗长一些，但通过明确说明什么可以为 `null` 和什么不可以为 `null`，有助于防止错误 \[18]。

更改字段的数据类型是可能的，前提是 Avro 可以转换该类型。更改字段的名称是可能的，但有点棘手：读取器的模式可以包含字段名称的别名，因此可以将旧写者的模式字段名称与别名进行匹配。这意味着更改字段名称是向后兼容的，但不是向前兼容的。同样，向联合类型添加一个分支是向后兼容的，但不是向前兼容的。

#### 但什么是写者的 schema？

有一个重要的问题我们到目前为止还没有提到：读者如何知道特定数据编码所使用的写者 schema？我们不能在每条记录中都包含整个 schema，因为 schema 可能会比编码的数据大得多，这样就会使得二进制编码所带来的空间节省变得毫无意义。

答案取决于 Avro 使用的上下文。举几个例子：

**包含大量记录的大文件**

Avro 的一个常见用途是存储一个包含数百万条记录的大文件，所有记录都使用相同的模式进行编码。在这种情况下，文件的写者可以在文件开头只包含一次写者 schema。Avro 指定了一种文件格式 (对象容器文件) 来实现这一点。

**具有单独编写记录的数据库**

在数据库中，不同的记录可能在不同的时间点使用不同的写者 schema 进行编写 —— 你不能假设所有记录都具有相同的 schema。最简单的解决方案是在每个编码记录的开头包含一个版本号，并在数据库中保留一个 schema 版本列表。读者可以获取记录，提取版本号，然后从数据库中获取该版本号的写者 schema。使用该写者 schema，它可以解码记录的其余部分。例如，Confluent 的 Apache Kafka Schema Registry \[19] 和 LinkedIn 的 Espresso \[20] 就是这样工作的。

**通过网络连接发送记录**

当两个进程通过双向网络连接进行通信时，它们可以在连接建立时协商 schema 版本，然后在连接的整个生命周期内使用该 schema。Avro RPC 协议 (参见 [“通过服务的数据流：REST 和 RPC”](#通过服务的数据流rest-和-rpc)) 就是这样工作的。

数据库的 schema 版本记录在任何情况下都是有用的，因为它充当文档，并给你机会检查 schema 兼容性 \[21]。作为版本号，你可以使用一个简单的递增整数，或者使用 schema 的哈希值。

#### 动态生成的 schema

与 Protocol Buffers 相比，Avro 方法的一个优势是 schema 不包含任何标签编号。但这为什么重要呢？在 schema 中保留几个数字有什么问题？

区别在于 Avro 对动态生成的 schema 更友好。例如，假设你有一个关系数据库，其内容你想导出到文件中，并且你想使用二进制格式以避免前面提到的文本格式 (JSON、CSV、XML) 的问题。如果你使用 Avro，你可以相对容易地从关系模式生成一个 Avro schema (在我们之前看到的 JSON 表示中)，并使用该 schema 编码数据库内容，将其全部导出到一个 Avro 对象容器文件 \[22]。你可以为每个数据库表生成一个记录 schema，每一列成为该记录中的一个字段。数据库中的列名映射到 Avro 中的字段名。

现在，如果数据库 schema 发生变化 (例如，一个表添加了一列并移除了一列)，您只需从更新后的数据库 schema 生成一个新的 Avro schema，并以新的 Avro schema 导出数据。数据导出过程不需要关注 schema 变化 —— 它可以在每次运行时简单地进行 schema 转换。任何读取新数据文件的人都会看到记录的字段发生了变化，但由于字段是通过名称来识别的，更新后的写者 schema 仍然可以与旧的读者 schema 匹配。

相比之下，如果您使用 Protocol Buffers 来实现这一目的，字段标签可能需要手动分配：每次数据库 schema 变化时，管理员都必须手动更新数据库列名与字段标签之间的映射。(这可能可以自动化，但 schema 生成器必须非常小心，以免分配之前使用过的字段标签。) 这种动态生成的 schema 根本不是协议缓冲区的设计目标，而是 Avro 的设计目标。

### schema 的优点

正如我们所看到的，Protocol Buffers 和 Avro 都使用 schema 来描述二进制编码格式。它们的 schema 语言比 XML Schema 或 JSON Schema 简单得多，后者支持更详细的验证规则 (例如，“该字段的字符串值必须匹配此正则表达式” 或 “该字段的整数值必须在 0 到 100 之间”)。由于 Protocol Buffers 和 Avro 更易于实现和使用，因此它们已经支持了相当广泛的编程语言。

这些编码所基于的思想绝不是新鲜事物。例如，它们与 ASN.1 有很多共同之处，ASN.1 是一种模式定义语言，首次在 1984 年标准化 \[23, 24]。它用于定义各种网络协议，其二进制编码 (DER) 至今仍用于编码 SSL 证书 (X.509)，例如 \[ 25]。ASN.1 使用标签编号支持 schema 演进，类似于 Protocol Buffers \[ 26]。然而，它也非常复杂且文档不完善，因此 ASN.1 可能不是新应用程序的好选择。

> ASN.1 (Abstract Syntax Notation One，抽象语法标记法第一版) 是一种用于定义数据结构的标准语法，广泛应用于网络通信协议、加密证书 (如 X.509)、电信系统等领域。

许多数据系统还实现了一种专有的二进制编码来存储它们的数据。例如，大多数关系数据库都有一个网络协议，通过该协议可以向数据库发送查询并获取响应。这些协议通常特定于某个特定的数据库，数据库供应商提供一个驱动程序 (例如，使用 ODBC 或 JDBC API)，将来自数据库网络协议的响应解码为内存中的数据结构。

因此，我们可以看到，尽管像 JSON、XML 和 CSV 这样的文本数据格式非常普遍，但基于 schema 的二进制编码也是一个可行的选择。它们具有许多优良特性：

- 它们可以比各种 “二进制 JSON” 变体更加紧凑，因为它们可以省略编码数据中的字段名称。

- schema 是一种有价值的文档形式，并且由于解码需要 schema，您可以确保它是最新的 (而手动维护的文档可能很容易与现实脱节)。

- 保持一个 schema 数据库可以让您在任何内容部署之前检查 schema 更改的向前和向后兼容性。

- 对于静态类型编程语言的用户，从 schema 生成代码的能力是有用的，因为它可以在编译时进行类型检查。

总之，schema 演进提供了与无 schema / 按需 schema JSON 数据库相同类型的灵活性 (参见 “文档模型中的 schema 灵活性”)，同时也提供了更好的数据保证和更好的工具。

## 数据流 schema

在本章开始时，我们提到每当您想要将一些数据发送到另一个与您不共享内存的进程时 —— 例如，每当您想通过网络发送数据或将其写入文件时 —— 您需要将其编码为字节序列。然后我们讨论了多种不同的编码方式来实现这一点。

我们谈到了向前和向后兼容性，这对于可演化性非常重要 (通过允许您独立升级系统的不同部分，使更改变得容易，而不必一次性更改所有内容)。<mark>兼容性是一个进程编码数据与另一个进程解码数据之间的关系。</mark>

这是一个相当抽象的概念 —— 数据可以通过多种方式从一个进程流向另一个进程。谁来编码数据，谁来解码数据？在本章的其余部分，我们将探讨数据在进程之间流动的一些最常见方式：

- 通过数据库 (见 [“数据在数据库中的流动”](#数据在数据库中的流动))

- 通过服务调用 (见 [“通过服务的数据流：REST 和 RPC”](#通过服务的数据流rest-和-rpc))

- 通过工作流引擎 (见 [“持久执行和工作流”](#持久执行和工作流))

- 通过异步消息 (见 [“事件驱动架构”](#事件驱动架构))

### 数据在数据库中的流动

在数据库中，写入数据库的过程对数据进行编码，而从数据库读取的过程则对其进行解码。在可能只有一个进程访问数据库的情况下，读者只是同一进程的后续版本 —— 在这种情况下，你可以将存储在数据库中的内容视为向未来的自己发送一条消息。

向后兼容性在这种情况下显然是必要的；否则，未来的进程将无法解码之前进程写入的内容。

一般来说，多个不同的进程同时访问数据库是很常见的。这些进程可能是几个不同的应用程序或服务，或者它们可能只是同一服务的几个实例 (为了可扩展性或容错而并行运行)。无论哪种方式，在应用程序不断变化的环境中，访问数据库的一些进程可能正在运行较新的代码，而一些则在运行较旧的代码 —— 例如，因为当前正在进行滚动升级的新版本部署，所以一些实例已经更新，而其他实例尚未更新。

这意味着数据库中的一个值可能会被代码的新版本写入，随后被仍在运行的旧版本代码读取。因此，数据库通常也需要向前兼容。

#### 在不同时间写入不同的值

数据库通常允许在任何时间更新任何值。这意味着在单个数据库中，您可能会有一些值是五毫秒前写入的，还有一些值是五年前写入的。

当您部署应用程序的新版本 (至少是服务器端应用程序) 时，您可能会在几分钟内完全用新版本替换旧版本。但数据库内容并非如此：五年前的数据仍然会存在，以原始编码形式保存，除非您自那时起明确地重写了它。这一观察有时被总结为*数据的生命周期超过代码*。

将数据重写 (迁移) 到新模式当然是可能的，但在大型数据集上进行这项操作是非常昂贵的，因此大多数数据库会尽量避免这样做。大多数关系数据库允许简单的模式更改，例如添加一个默认值为 `null` 的新列，而无需重写现有数据。当读取旧行时，数据库会为任何在磁盘上编码数据中缺失的列填充 `null` 。因此，schema 演进使整个数据库看起来像是用单一模式编码的，即使底层存储可能包含用各种历史版本的模式编码的记录。

更复杂的 schema 更改 —— 例如，将单值属性更改为多值，或将某些数据移动到单独的表 —— 仍然需要重写数据，通常是在应用程序层面进行的 \[27]。在这种迁移中维护向前和向后兼容性仍然是一个研究问题 \[28]。

#### 归档存储

也许你会不时对数据库进行快照，比如出于备份目的或加载到数据仓库 (参见 *数据仓库*)。在这种情况下，数据转储通常会使用最新的模式进行编码，即使源数据库中的原始编码包含来自不同时代的模式版本的混合。既然你反正要复制数据，不如将数据的副本一致地编码。

由于数据转储是一口气写入的，并且此后不可更改，因此像 Avro 对象容器文件这样的格式非常合适。这也是一个很好的机会，可以将数据编码为分析友好的列式格式，例如 Parquet (参见 “列压缩”)。

### 通过服务的数据流：REST 和 RPC

当你有需要通过网络进行通信的进程时，有几种不同的方式来安排这种通信。最常见的安排是有两个角色：客户端和服务器。服务器通过网络暴露一个 API，客户端可以连接到服务器以向该 API 发出请求。服务器暴露的 API 被称为*服务*。

网络就是这样运作的：客户端 (网页浏览器) 向网页服务器发出请求，发出 `GET` 请求以下载 HTML、CSS、JavaScript、图像等，并发出 `POST` 请求以向服务器提交数据。API 由一组标准化的协议和数据格式 (HTTP、URLs、SSL/TLS、HTML 等) 组成。由于网页浏览器、网页服务器和网站作者大多同意这些标准，因此你可以使用任何网页浏览器访问任何网站 (至少在理论上是这样！)。

Web 浏览器并不是唯一的客户端类型。例如，运行在移动设备和桌面计算机上的原生应用程序通常与服务器进行通信，而在 Web 浏览器中运行的客户端 JavaScript 应用程序也可以发出 HTTP 请求。在这种情况下，服务器的响应通常不是用于人类显示的 HTML，而是以便于客户端应用程序代码进一步处理的编码格式的数据 (通常是 JSON)。尽管 HTTP 可以用作传输协议，但其上实现的 API 是特定于应用程序的，客户端和服务器需要就该 API 的细节达成一致。

在某些方面，服务与数据库相似：它们通常允许客户端提交和查询数据。然而，尽管数据库允许使用我们在[第3章](data-models-and-query-languages.md)中讨论的查询语言进行任意查询，但服务会暴露一个应用程序特定的API，该API仅允许由服务业务逻辑（应用程序代码）预先确定的输入和输出[29]。这种限制提供了一定程度的封装：服务可以对客户端可以执行和不能执行的操作施加细粒度的限制。

面向服务 / 微服务架构的一个关键设计目标是通过使服务能够独立部署和演进，从而使应用程序更易于更改和维护。一个常见的原则是，每个服务应由一个团队负责，该团队应能够频繁发布服务的新版本，而无需与其他团队协调。因此，我们应该预期旧版本和新版本的服务器和客户端会同时运行，因此服务器和客户端使用的数据编码必须在服务 API 的不同版本之间兼容。

#### Web 服务

当 HTTP 被用作与服务通信的底层协议时，它被称为 Web 服务。在构建面向服务或微服务架构时 (在 [“微服务和无服务器”](tradeoffs-in-data-systems-architecture.md#微服务与无服务器) 中讨论过)，Web 服务被广泛使用。*Web 服务* 这个术语或许有些不准确，因为 Web 服务不仅在网络上使用，还在多个不同的上下文中使用。例如：

1. 在用户设备上运行的客户端应用程序 (例如，移动设备上的原生应用或浏览器中的 JavaScript 网页应用) 通过 HTTP 向服务发出请求。这些请求通常通过公共互联网进行。

2. 一个服务向同一组织拥有的另一个服务发出请求，通常位于同一数据中心，作为面向服务 / 微服务架构的一部分。

3. 一个服务向不同组织拥有的服务发出请求，通常通过互联网。这用于不同组织的后端系统之间的数据交换。此类别包括在线服务提供的公共 API，例如信用卡处理系统或用于共享用户数据访问的 OAuth。

最流行的服务设计理念是 REST，它建立在 HTTP 的原则之上 \[30, 31]。它强调简单的数据格式，使用 URL 来标识资源，并利用 HTTP 特性进行缓存控制、身份验证和内容类型协商。根据 REST 原则设计的 API 称为 RESTful。

需要调用 Web 服务 API 的代码必须知道要查询哪个 HTTP 端点，以及要发送和期望的响应数据格式。即使服务采用 RESTful 设计原则，客户端仍然需要以某种方式找出这些细节。服务开发人员通常使用接口定义语言 (IDL) 来定义和记录其服务的 API 端点和数据模型，并随着时间的推移对其进行演进。其他开发人员可以使用服务定义来确定如何查询该服务。最流行的两种服务 IDL 是 OpenAPI (也称为 Swagger \[32]) 和 gRPC。OpenAPI 用于发送和接收 JSON 数据的 Web 服务，而 gRPC 服务则发送和接收 Protocol Buffers。

开发人员通常以 JSON 或 YAML 编写 OpenAPI 服务定义；见示例 5-3。服务定义允许开发人员定义服务端点、文档、版本、数据模型等更多内容。gRPC 定义看起来类似，但使用协议缓冲区服务定义进行定义。

_示例 5-3. 示例 OpenAPI 服务定义 (YAML 格式)_

```yaml
openapi: 3.0.0
info:
  title: Ping, Pong
  version: 1.0.0
servers:
  - url: http://localhost:8080
paths:
  /ping:
    get:
      summary: Given a ping, returns a pong message
      responses:
        '200':
          description: A pong
          content:
            application/json:
            schema:
              type: object
              properties:
                message:
                  type: string
                  example: Pong!
```

即使采用了设计理念和 IDL，开发者仍然必须编写实现其服务 API 调用的代码。通常会采用服务框架来简化这一工作。像 Spring Boot、FastAPI 和 gRPC 这样的服务框架允许开发者为每个 API 端点编写业务逻辑，而框架代码则处理路由、指标、缓存、身份验证等。示例 5-4 展示了在示例 5-3 中定义的服务的 Python 实现示例。

_示例 5-4 实现示例 5-3 中定义的 FastAPI 服务示例_

```python
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Ping, Pong", version="1.0.0")

class PongResponse(BaseModel):
    message: str = "Pong!"

@app.get("/ping", response_model=PongResponse, summary="Given a ping, returns a pong message")
async def ping():
    return PongResponse()
```

许多框架将服务定义和服务器代码结合在一起。在某些情况下，例如流行的 Python FastAPI 框架，服务器是用代码编写的，并且 IDL 是自动生成的。在其他情况下，例如 gRPC，服务定义是首先编写的，然后生成服务器代码的脚手架。这两种方法都允许开发人员从服务定义生成多种语言的客户端库和 SDK。除了代码生成，IDL 工具如 Swagger 还可以生成文档，验证模式变更的兼容性，并为开发人员提供图形用户界面以查询和测试服务。

#### 远程过程调用 (RPC) 的问题

Web 服务只是通过网络发出 API 请求的一系列技术中的最新体现，其中许多技术曾受到过高度关注，但存在严重问题。企业级 JavaBeans (EJB) 和 Java 的远程方法调用 (RMI) 仅限于 Java。分布式组件对象模型 (DCOM) 仅限于微软平台。通用对象请求代理架构 (CORBA) 过于复杂，并且不提供向后或向前兼容性 \[ 33]。SOAP 和 WS-* Web 服务框架旨在提供跨供应商的互操作性，但也受到复杂性和兼容性问题的困扰 \[34, 35, 36]。

所有这些都基于远程过程调用 (RPC) 的概念，该概念自 1970 年代以来就存在 \[ 37]。RPC 模型试图使对远程网络服务的请求看起来与在同一进程中调用编程语言中的函数或方法相同 (这种抽象称为*位置透明性*)。尽管 RPC 乍看之下似乎很方便，但这种方法在根本上是有缺陷的 \[ 38, 39]。网络请求与本地函数调用有很大不同：

- 本地函数调用是可预测的，成功或失败仅取决于您控制的参数。网络请求则不可预测：请求或响应可能因网络问题而丢失，或者远程机器可能响应缓慢或不可用，这些问题完全超出您的控制范围。网络问题很常见，因此您必须预见这些问题，例如通过重试失败的请求。

- 本地函数调用要么返回结果，要么抛出异常，要么永不返回 (因为进入无限循环或进程崩溃)。网络请求还有另一种可能的结果：由于超时，它可能返回但没有结果。在这种情况下，您根本不知道发生了什么：如果您没有收到远程服务的响应，就无法知道请求是否成功发送。

- 如果你重试一个失败的网络请求，可能会发生之前的请求实际上已经成功，只是响应丢失了。在这种情况下，重试将导致该操作被多次执行，除非你在协议中构建一个去重 (幂等性) 机制 \[ 40]。本地函数调用没有这个问题。

- 每次调用本地函数时，执行所需的时间通常大致相同。网络请求比函数调用慢得多，并且其延迟也变化很大：在良好的情况下，它可能在不到一毫秒的时间内完成，但当网络拥堵或远程服务过载时，完成完全相同的操作可能需要几秒钟。

- 当你调用本地函数时，可以高效地将本地内存中对象的引用 (指针) 传递给它。当你发起网络请求时，所有这些参数需要被编码成可以通过网络发送的字节序列。如果参数是不可变的基本类型，比如数字或短字符串，这没问题，但当数据量较大或对象可变时，这很快就会变得复杂。

- 客户端和服务端可能使用不同的编程语言实现，因此 RPC 框架必须将数据类型从一种语言转换为另一种。这可能会变得很复杂，因为并不是所有语言都有相同的类型 —— 例如，回想一下 JavaScript 在处理大于 $2^{53}$ 的数字时遇到的问题 (参见 “JSON、XML 和二进制变体”)。在单一语言编写的单一进程中，这个问题是不存在的。

所有这些因素都意味着，在编程语言中试图让远程服务看起来过于像本地对象是没有意义的，因为它们本质上是不同的。REST 的吸引力之一在于，它将网络上的状态传输视为与函数调用不同的过程。

#### 负载均衡器、服务发现和服务网格

所有服务通过网络进行通信。因此，客户端必须知道它所连接的服务的地址 —— 这个问题被称为服务发现。最简单的方法是配置客户端以连接到服务运行的 IP 地址和端口。这个配置是可行的，但如果服务器下线、转移到新机器或过载，客户端就必须手动重新配置。

为了提供更高的可用性和可扩展性，通常会在不同的机器上运行多个服务实例，任何一个实例都可以处理传入的请求。将请求分散到这些实例上称为*负载均衡* \[41]。有许多负载均衡和服务发现解决方案可供选择：

- *硬件负载均衡器*是安装在数据中心的专用设备。它们允许客户端连接到单个主机和端口，传入的连接会被路由到运行服务的服务器之一。这种负载均衡器在连接到下游服务器时会检测网络故障，并将流量转移到其他服务器。

- *软件负载均衡器*的行为与硬件负载均衡器非常相似。但与需要专用设备不同，软件负载均衡器如 Nginx 和 HAProxy 是可以安装在标准机器上的应用程序。

- *域名系统（DNS）* 是互联网中解析域名的方式，当您打开网页时，域名系统会将域名解析为对应的IP地址。它通过允许多个 IP 地址与单个域名关联来支持负载均衡。然后，可以配置客户端使用域名而不是 IP 地址连接到服务，客户端的网络层在建立连接时选择使用哪个 IP 地址。这种方法的一个缺点是，DNS 设计用于在较长时间内传播更改，并缓存 DNS 条目。如果服务器频繁启动、停止或移动，客户端可能会看到不再有服务器在其上运行的过时 IP 地址。

  *服务发现系统*使用集中式注册表而不是 DNS 来跟踪可用的服务端点。当一个新的服务实例启动时，它通过声明其监听的主机和端口以及相关的元数据 (如分片所有权信息 (见[第 7 章](sharding.md))、数据中心位置等) 向服务发现系统注册。然后，该服务定期向发现系统发送心跳信号，以表明该服务仍然可用。

- 当客户端希望连接到服务时，它首先查询发现系统以获取可用端点的列表，然后直接连接到该端点。与 DNS 相比，服务发现支持一个更加动态的环境，其中服务实例频繁变化。发现系统还为客户端提供了更多关于它们所连接服务的元数据，这使得客户端能够做出更智能的负载均衡决策。

  *服务网格*是一种复杂的负载均衡形式，结合了软件负载均衡器和服务发现。与传统的软件负载均衡器不同，后者运行在单独的机器上，服务网格负载均衡器通常作为进程内客户端库或作为客户端和服务器上的*边车*容器进行部署。客户端应用程序连接到其本地服务负载均衡器，该负载均衡器再连接到服务器的负载均衡器。从那里，连接被路由到本地服务器进程。

- 尽管较为复杂，这种拓扑结构仍具备诸多优势。由于客户端和服务器完全通过本地连接进行路由，连接加密可以完全在负载均衡器级别处理。这使得客户端和服务器无需处理 SSL 证书和 TLS 的复杂性。网格系统还提供了复杂的可观察性。它们可以实时跟踪哪些服务相互调用，检测故障，跟踪流量负载等。

适合的解决方案取决于组织的需求。在一个非常动态的服务环境中，使用像 Kubernetes 这样的调度器的组织通常选择运行像 Istio 或 Linkerd 这样的服务网格。专用基础设施，如数据库或消息系统，可能需要其专门构建的负载均衡器。对于更简单的部署，软件负载均衡器是最佳选择。

#### RPC 的数据编码和演进

为了可演进性，RPC 客户端和服务器能够独立更改和部署是很重要的。与通过数据库流动的数据 (如上一节所述) 相比，在服务之间的数据流动的情况下，我们可以做一个简化的假设：合理假设所有服务器会首先更新，所有客户端会其次更新。因此，您只需要在请求上保持向后兼容性，在响应上保持向前兼容性。
> 新客户端发送的请求，旧服务端仍能处理；旧客户端可以理解或忽略新服务端返回的响应。

RPC 方案的向后和向前兼容性属性是继承自其使用的任何编码：

- gRPC (Protocol Buffers) 和 Avro RPC 可以根据各自编码格式的兼容性规则进行演进。

- RESTful API 最常使用 JSON 作为响应格式，而请求参数则使用 JSON 或 URI 编码 / 表单编码。添加可选请求参数和向响应对象添加新字段通常被视为保持兼容性的更改。

服务兼容性变得更加困难，因为 RPC 通常用于跨组织边界的通信，因此服务提供者往往无法控制其客户端，也无法强迫他们升级。因此，兼容性需要长期保持，甚至可能是无限期的。如果需要进行破坏兼容性的更改，服务提供者通常最终会并行维护多个版本的服务 API。
> 出现 `api/v1`、`api/v2` 的情况

关于 API 版本控制的工作方式没有达成一致意见 (即，客户端如何指示其希望使用的 API 版本 \[42])。对于 RESTful API，常见的方法是在 URL 中或在 HTTP Accept 头中使用版本号。对于使用 API 密钥来识别特定客户端的服务，另一种选择是在服务器上存储客户端请求的 API 版本，并允许通过单独的管理界面更新此版本选择 \[43]。

### 持久执行和工作流

根据定义，基于服务的架构有多个服务，这些服务负责应用程序的不同部分。考虑一个支付处理应用程序，它会对信用卡收费并将资金存入银行账户。该系统可能会有不同的服务负责欺诈检测、信用卡集成、银行集成等。

在我们的示例中，处理单个支付需要多个服务调用。支付处理服务可能会调用欺诈检测服务以检查欺诈，调用信用卡服务以扣款，并调用银行服务以存入扣款资金，如图 5-7 所示。我们将这一系列步骤称为工作流，每个步骤称为任务。工作流通常被定义为任务的图。工作流定义可以用通用编程语言、领域特定语言 (DSL) 或标记语言 (如业务流程执行语言 BPEL) 编写 \[44]。

::: tip **任务、活动和函数**
不同的工作流引擎对任务使用不同的名称。例如，Temporal 使用活动这个术语。其他一些则将任务称为持久函数。尽管名称不同，但概念是相同的。
:::

![ddia 0507](/ddia/ddia_0507.png)
_图 5-7. 使用业务流程模型和标记法 (BPMN) 表示的工作流示例，这是一种图形标记法。_

工作流由*工作流引擎*运行或执行。工作流引擎决定何时运行每个任务、任务必须在何种机器上运行、如果任务失败 (例如，如果机器在任务运行时崩溃) 该怎么办、允许并行执行多少任务等。

工作流引擎通常由调度器和执行器组成。调度器负责安排要执行的任务，而执行器负责执行任务。当工作流被触发时，执行开始。如果用户定义了基于时间的调度，例如每小时执行，调度器会触发工作流本身。外部来源，如网络服务甚至人类，也可以触发工作流执行。一旦被触发，执行器就会被调用来运行任务。

有许多种工作流引擎可以满足多样化的用例。一些引擎，如 Airflow、Dagster 和 Prefect，与数据系统集成并协调 ETL 任务。其他引擎，如 Camunda 和 Orkes，提供工作流的图形表示法 (如图 5-7 中使用的 BPMN)，使非工程师能够更轻松地定义和执行工作流。还有一些引擎，如 Temporal 和 Restate，提供持久化执行。

#### 持久执行

持久化执行框架已成为构建需要事务性的基于服务的架构的流行方式。在我们的支付示例中，我们希望每笔支付只处理一次。在工作流执行过程中发生的故障可能导致信用卡被扣款，但没有相应的银行账户存款。在基于服务的架构中，我们不能简单地将这两个任务包装在数据库事务中。此外，我们可能还在与我们控制有限的第三方支付网关进行交互。

持久执行框架是一种为工作流提供*精确一次语义*的方法。如果一个任务失败，框架将重新执行该任务，但会跳过任务在失败之前成功完成的任何 RPC 调用或状态更改。相反，框架将假装进行调用，但实际上会返回先前调用的结果。这是可能的，因为持久执行框架将所有 RPC 和状态更改记录到持久存储中，例如预写日志 \[45, 46]。示例 5-5 展示了一个支持持久执行的工作流定义示例，使用 Temporal。

_示例 5-5. 图 5-7 中支付工作流的 Temporal 工作流定义片段。_

```python
@workflow.defn
class PaymentWorkflow:
    @workflow.run
    async def run(self, payment: PaymentRequest) -> PaymentResult:
        is_fraud = await workflow.execute_activity(check_fraud, payment, start_to_close_timeout=timedelta(seconds=15),)
        if is_fraud:
            return PaymentResultFraudulent
        credit_card_response = await workflow.execute_activity(debit_credit_card,payment,start_to_close_timeout=timedelta(seconds=15),) 
        # ...
```

像 Temporal 这样的框架并非没有挑战。外部服务，例如我们示例中的第三方支付网关，仍然必须提供*幂等* API。开发者必须记得为这些 API 使用唯一的 ID，以防止重复执行 \[47]。由于持久执行框架按顺序记录每个 RPC 调用，它期望后续执行以相同的顺序进行相同的 RPC 调用。这使得代码更容易出错。仅仅通过重新排列函数调用，您可能就会引入未定义的行为 \[48]。

同样，由于持久执行框架期望以确定性重放所有代码 (相同的输入产生相同的输出)，因此随机数生成器或系统时钟等非确定性代码是有问题的 \[48]。框架通常提供自己的确定性实现的库函数，但您必须记得使用它们。在某些情况下，例如 Temporal 的 workflowcheck 工具，框架提供静态分析工具以确定是否引入了非确定性行为。

::: tip 注意
使代码具有确定性是一个强大的想法，但要稳健地实现却很棘手。
:::

### 事件驱动架构

在最后这一部分，我们将简要探讨*事件驱动架构*，这是一种编码数据从一个过程流向另一个过程的方式。请求被称为事件或消息；与 RPC 不同，发送方通常不等待接收方处理事件。此外，事件通常不是通过直接的网络连接发送给接收方，而是通过一个称为*消息代理*的中介 (也称为*事件代理*、*消息队列*或*面向消息的中间件*) 进行传递，该中介暂时存储消息。\[49].

与直接 RPC 相比，使用消息代理有几个优点：

- 如果接收方不可用或过载，它可以充当缓冲区，从而提高系统的可靠性。

- 它可以自动将消息重新发送到崩溃的进程，从而防止消息丢失。

- 它避免了服务发现的需求，因为发送者不需要直接连接到接收者的 IP 地址。

- 它允许将相同的消息发送给多个接收者。

- 它在逻辑上将发送者与接收者解耦 (发送者只需发布消息，而不关心谁来消费这些消息)。

通过消息代理的通信是*异步的*：发送者不等待消息被送达，而是简单地发送消息然后忘记它。可以通过让发送者在一个单独的通道上等待响应来实现类似同步 RPC 的模型。

#### 消息代理

在过去，消息代理的领域主要由 TIBCO、IBM WebSphere 和 webMethods 等公司的商业企业软件主导，直到 RabbitMQ、ActiveMQ、HornetQ、NATS 和 Apache Kafka 等开源实现变得流行。最近，亚马逊 Kinesis、Azure 服务总线和谷歌云 Pub/Sub 等云服务也获得了广泛应用。

详细的交付语义因实现和配置而异，但一般来说，最常用的两种消息分发模式是：

- 一个进程将消息添加到一个命名队列中，代理将该消息传递给该队列的消费者。如果有多个消费者，其中一个将接收该消息。

- 一个进程将消息发布到一个命名主题中，代理将该消息传递给该主题的所有订阅者。如果有多个订阅者，他们都会接收到该消息。

消息代理通常不强制执行任何特定的数据模型 —— 消息只是带有一些元数据的字节序列，因此您可以使用任何编码格式。一种常见的方法是使用 Protocol Buffers、Avro 或 JSON，并在消息代理旁边部署一个 schema registry，以存储所有有效的模式版本并检查它们的兼容性 \[19, 21]。AsyncAPI，作为基于消息的 OpenAPI 等价物，也可以用于指定消息的模式。

消息代理在消息的持久性方面有所不同。许多消息代理将消息写入磁盘，以防在消息代理崩溃或需要重启时丢失消息。与数据库不同，许多消息代理在消息被消费后会自动删除这些消息。一些代理可以配置为无限期存储消息，如果您想使用事件溯源 (参见 “事件溯源和 CQRS”)，这将是您所需要的。

如果消费者将消息重新发布到另一个主题，您可能需要小心保留未知字段，以防止在数据库上下文中描述的问题 (图 5-1)。

### 分布式执行者框架

执行者模型是一种用于单个进程中并发的编程模型。它不是直接处理线程 (以及与竞争条件、锁定和死锁相关的问题)，而是将逻辑封装在执行者中。每个执行者通常代表一个客户端或实体，它可能具有一些本地状态 (该状态不与任何其他执行者共享)，并通过发送和接收异步消息与其他执行者进行通信。消息传递并不保证：在某些错误场景中，消息可能会丢失。由于每个执行者一次只处理一条消息，因此它不需要担心线程问题，并且每个执行者可以由框架独立调度。

在分布式执行者框架中，如 Akka、Orleans \[50] 和 Erlang/OTP，这种编程模型用于在多个节点之间扩展应用程序。无论发送者和接收者是在同一节点还是不同节点，都使用相同的消息传递机制。如果它们位于不同节点，则消息会被透明地编码为字节序列，通过网络发送，并在另一端解码。

位置透明性在执行者模型中比在 RPC 中更有效，因为执行者模型已经假设消息可能会丢失，即使在单个进程内也是如此。尽管网络延迟可能高于同一进程内的延迟，但在使用执行者模型时，本地和远程通信之间的根本不匹配较少。

分布式执行者框架本质上将消息代理和执行者编程模型集成到一个单一框架中。然而，如果您想对基于执行者的应用程序进行滚动升级，您仍然需要担心向前和向后兼容性，因为消息可能会从运行新版本的节点发送到运行旧版本的节点，反之亦然。这可以通过使用本章讨论的编码之一来实现。

## 总结

在本章中，我们探讨了几种将数据结构转换为网络上的字节或磁盘上的字节的方法。我们看到这些编码的细节不仅影响它们的效率，更重要的是影响应用程序的架构以及您对其演进的选择。

特别是，许多服务需要支持滚动升级，即服务的新版本逐渐部署到少数节点，而不是同时部署到所有节点。滚动升级允许在没有停机时间的情况下发布服务的新版本 (从而鼓励频繁的小版本发布而不是罕见的大版本发布)，并使部署风险降低 (允许在影响大量用户之前检测并回滚有缺陷的发布)。这些特性对可演化性非常有利，即对应用程序进行更改的便利性。

在滚动升级期间，或出于其他各种原因，我们必须假设不同的节点正在运行我们应用程序代码的不同版本。因此，确保系统中流动的所有数据以提供向后兼容性 (新代码可以读取旧数据) 和向前兼容性 (旧代码可以读取新数据) 的方式进行编码是很重要的。

我们讨论了几种数据编码格式及其兼容性特性：

- 特定于编程语言的编码限制在单一编程语言内，通常无法提供向前和向后兼容性。

- 像 JSON、XML 和 CSV 这样的文本格式非常普遍，它们的兼容性取决于你如何使用它们。它们有可选的模式语言，有时有帮助，有时则是障碍。这些格式对数据类型的定义有些模糊，因此在处理数字和二进制字符串等内容时需要小心。

- 像 Protocol Buffers 和 Avro 这样的二进制模式驱动格式允许紧凑、高效的编码，并具有明确定义的向前和向后兼容性语义。这些模式在静态类型语言中对于文档和代码生成非常有用。然而，这些格式的缺点是数据在可读之前需要解码。

我们还讨论了几种数据流模式，说明了数据编码重要的不同场景：

- 数据库，其中写入数据库的过程对数据进行编码，而从数据库读取的过程对其进行解码。

- RPC 和 REST API，其中客户端编码请求，服务器解码请求并编码响应，最后客户端解码响应

- 事件驱动架构 (使用消息中间件或执行者)，节点通过发送彼此的消息进行通信，这些消息由发送方编码，由接收方解码

我们可以得出结论，只要稍加注意，向后 / 向前兼容性和滚动升级都是相当可行的。愿您的应用程序快速演进，部署频繁。

### 参考文献

\[1] CWE-502: Deserialization of Untrusted Data. Common Weakness Enumeration, cwe.mitre.org, July 2006. Archived at perma.cc/26EU-UK9Y

\[2] Steve Breen. What Do WebLogic, WebSphere, JBoss, Jenkins, OpenNMS, and Your Application Have in Common? This Vulnerability. foxglovesecurity.com, November 2015. Archived at perma.cc/9U97-UVVD

\[3] Patrick McKenzie. What the Rails Security Issue Means for Your Startup. kalzumeus.com, January 2013. Archived at perma.cc/2MBJ-7PZ6

\[4] Brian Goetz. Towards Better Serialization. openjdk.org, June 2019. Archived at perma.cc/UK6U-GQDE

\[5] Eishay Smith. jvm-serializers wiki. github.com, October 2023. Archived at perma.cc/PJP7-WCNG

\[6] XML Is a Poor Copy of S-Expressions. wiki.c2.com, May 2013. Archived at perma.cc/7FAN-YBKL

\[7] Julia Evans. Examples of floating point problems. jvns.ca, January 2023. Archived at perma.cc/M57L-QKKW

\[8] Matt Harris. Snowflake: An Update and Some Very Important Information. Email to Twitter Development Talk mailing list, October 2010. Archived at perma.cc/8UBV-MZ3D

\[9] Yakov Shafranovich. RFC 4180: Common Format and MIME Type for Comma-Separated Values (CSV) Files. IETF, October 2005.

\[10] Andy Coates. Evolving JSON Schemas - Part I and Part II. creekservice.org, January 2024. Archived at perma.cc/MZW3-UA54 and perma.cc/GT5H-WKZ5

\[11] Pierre Genevès, Nabil Layaïda, and Vincent Quint. Ensuring Query Compatibility with Evolving XML Schemas. INRIA Technical Report 6711, November 2008.

\[12] Tim Bray. Bits On the Wire. tbray.org, November 2019. Archived at perma.cc/3BT3-BQU3

\[13] Mark Slee, Aditya Agarwal, and Marc Kwiatkowski. Thrift: Scalable Cross-Language Services Implementation. Facebook technical report, April 2007. Archived at perma.cc/22BS-TUFB

\[14] Martin Kleppmann. Schema Evolution in Avro, Protocol Buffers and Thrift. martin.kleppmann.com, December 2012. Archived at perma.cc/E4R2-9RJT

\[15] Doug Cutting, Chad Walters, Jim Kellerman, et al. \[PROPOSAL] New Subproject: Avro. Email thread on hadoop-general mailing list, lists.apache.org, April 2009. Archived at perma.cc/4A79-BMEB

\[16] Apache Software Foundation. Apache Avro 1.12.0 Specification. avro.apache.org, August 2024. Archived at perma.cc/C36P-5EBQ

\[17] Apache Software Foundation. Avro schemas as LL(1) CFG definitions. avro.apache.org, August 2024. Archived at perma.cc/JB44-EM9Q

\[18] Tony Hoare. Null References: The Billion Dollar Mistake. Talk at QCon London, March 2009.

\[19] Confluent, Inc. Schema Registry Overview. docs.confluent.io, 2024. Archived at perma.cc/92C3-A9JA

\[20] Aditya Auradkar and Tom Quiggle. Introducing Espresso—LinkedIn’s Hot New Distributed Document Store. engineering.linkedin.com, January 2015. Archived at perma.cc/FX4P-VW9T

\[21] Jay Kreps. Putting Apache Kafka to Use: A Practical Guide to Building a Stream Data Platform (Part 2). confluent.io, February 2015. Archived at perma.cc/8UA4-ZS5S

\[22] Gwen Shapira. The Problem of Managing Schemas. oreilly.com, November 2014. Archived at perma.cc/BY8Q-RYV3

\[23] John Larmouth. ASN.1 Complete. Morgan Kaufmann, 1999. ISBN: 978-0-122-33435-1. Archived at perma.cc/GB7Y-XSXQ

\[24] Burton S. Kaliski Jr. A Layman’s Guide to a Subset of ASN.1, BER, and DER. Technical Note, RSA Data Security, Inc., November 1993. Archived at perma.cc/2LMN-W9U8

\[25] Jacob Hoffman-Andrews. A Warm Welcome to ASN.1 and DER. letsencrypt.org, April 2020. Archived at perma.cc/CYT2-GPQ8

\[26] Lev Walkin. Question: Extensibility and Dropping Fields. lionet.info, September 2010. Archived at perma.cc/VX8E-NLH3

\[27] Jacqueline Xu. Online migrations at scale. stripe.com, February 2017. Archived at perma.cc/X59W-DK7Y

\[28] Geoffrey Litt, Peter van Hardenberg, and Orion Henry. Project Cambria: Translate your data with lenses. Technical Report, Ink & Switch, October 2020. Archived at perma.cc/WA4V-VKDB

\[29] Pat Helland. Data on the Outside Versus Data on the Inside. At 2nd Biennial Conference on Innovative Data Systems Research (CIDR), January 2005.

\[30] Roy Thomas Fielding. Architectural Styles and the Design of Network-Based Software Architectures. PhD Thesis, University of California, Irvine, 2000. Archived at perma.cc/LWY9-7BPE

\[31] Roy Thomas Fielding. REST APIs must be hypertext-driven.” roy.gbiv.com, October 2008. Archived at perma.cc/M2ZW-8ATG

\[32] OpenAPI Specification Version 3.1.0. swagger.io, February 2021. Archived at perma.cc/3S6S-K5M4

\[33] Michi Henning. The Rise and Fall of CORBA. Communications of the ACM, volume 51, issue 8, pages 52–57, August 2008. doi:10.1145/1378704.1378718

\[34] Pete Lacey. The S Stands for Simple. harmful.cat-v.org, November 2006. Archived at perma.cc/4PMK-Z9X7

\[35] Stefan Tilkov. Interview: Pete Lacey Criticizes Web Services. infoq.com, December 2006. Archived at perma.cc/JWF4-XY3P

\[36] Tim Bray. The Loyal WS-Opposition. tbray.org, September 2004. Archived at perma.cc/J5Q8-69Q2

\[37] Andrew D. Birrell and Bruce Jay Nelson. Implementing Remote Procedure Calls. ACM Transactions on Computer Systems (TOCS), volume 2, issue 1, pages 39–59, February 1984. doi:10.1145/2080.357392

\[38] Jim Waldo, Geoff Wyant, Ann Wollrath, and Sam Kendall. A Note on Distributed Computing. Sun Microsystems Laboratories, Inc., Technical Report TR-94-29, November 1994. Archived at perma.cc/8LRZ-BSZR

\[39] Steve Vinoski. Convenience over Correctness. IEEE Internet Computing, volume 12, issue 4, pages 89–92, July 2008. doi:10.1109/MIC.2008.75

\[40] Brandur Leach. Designing robust and predictable APIs with idempotency. stripe.com, February 2017. Archived at perma.cc/JD22-XZQT

\[41] Sam Rose. Load Balancing. samwho.dev, April 2023. Archived at perma.cc/Q7BA-9AE2

\[42] Troy Hunt. Your API versioning is wrong, which is why I decided to do it 3 different wrong ways. troyhunt.com, February 2014. Archived at perma.cc/9DSW-DGR5

\[43] Brandur Leach. APIs as infrastructure: future-proofing Stripe with versioning. stripe.com, August 2017. Archived at perma.cc/L63K-USFW

\[44] Alexandre Alves, Assaf Arkin, Sid Askary, et al. Web Services Business Process Execution Language Version 2.0. docs.oasis-open.org, April 2007.

\[45] What is a Temporal Service? docs.temporal.io, 2024. Archived at perma.cc/32P3-CJ9V

\[46] Stephan Ewen. Why we built Restate. restate.dev, August 2023. Archived at perma.cc/BJJ2-X75K

\[47] Keith Tenzer and Joshua Smith. Idempotency and Durable Execution. temporal.io, February 2024. Archived at perma.cc/9LGW-PCLU

\[48] What is a Temporal Workflow? docs.temporal.io, 2024. Archived at perma.cc/B5C5-Y396

\[49] Srinath Perera. Exploring Event-Driven Architecture: A Beginner’s Guide for Cloud Native Developers. wso2.com, August 2023. Archived at archive.org

\[50] Philip A. Bernstein, Sergey Bykov, Alan Geller, Gabriel Kliot, and Jorgen Thelin. Orleans: Distributed Virtual Actors for Programmability and Scalability. Microsoft Research Technical Report MSR-TR-2014-41, March 2014. Archived at perma.cc/PD3U-WDMF
